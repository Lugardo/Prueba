<?php
/**
 * API JSON de Control de Tareas Diarias.
 *
 * Enrutamiento: api.php?action=<grupo>/<op>
 * Ejemplos: auth/login, auth/register, users/list, tasks/create, notes/add
 * Todos los POST aceptan JSON body. Todas las respuestas son JSON.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if (($APP_ENV ?? 'production') === 'dev') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

// Sesiones con cookie segura
session_name($SESSION_NAME ?? 'aster_sid');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS'])),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

/* ---------------- Helpers ---------------- */

function json_out($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function json_err(string $msg, int $status = 400, array $extra = []): void {
    json_out(array_merge(['ok' => false, 'error' => $msg], $extra), $status);
}
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}
function uid(): string {
    return bin2hex(random_bytes(8)) . dechex((int)(microtime(true)*1000));
}
function db(): PDO {
    global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS;
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
            $DB_USER, $DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
    }
    return $pdo;
}

function current_user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $stmt = db()->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$_SESSION['user_id']]);
    $u = $stmt->fetch();
    if (!$u) return null;
    // Si cambiaron el estado del usuario, invalidar sesión
    if (in_array($u['status'], ['inactive','rejected','pending'], true)) return null;
    return public_user($u);
}
function require_login(): array {
    $u = current_user();
    if (!$u) json_err('No autenticado', 401);
    return $u;
}
function require_role(array $roles): array {
    $u = require_login();
    if (!in_array($u['role'], $roles, true)) json_err('No autorizado', 403);
    return $u;
}
function public_user(array $u): array {
    unset($u['password_hash']);
    return [
        'id'       => $u['id'],
        'name'     => $u['name'],
        'phone'    => $u['phone'],
        'email'    => $u['email'],
        'username' => $u['username'],
        'role'     => $u['role'],
        'status'   => $u['status'],
        'theme'    => $u['theme'] ?? 'light',
        'avatar'   => $u['avatar'],
    ];
}
function public_task(array $t, array $notes = []): array {
    return [
        'id'        => $t['id'],
        'userId'    => $t['user_id'],
        'name'      => $t['name'],
        'start'     => $t['start_time'],
        'end'       => $t['end_time'],
        'time'      => $t['time_spent'],
        'comments'  => $t['comments'],
        'status'    => $t['status'],
        'done'      => (int)$t['done'] === 1,
        'createdAt' => (int)$t['created_at'],
        'updatedAt' => (int)$t['updated_at'],
        'notes'     => $notes,
    ];
}
function public_note(array $n): array {
    return [
        'id'         => $n['id'],
        'authorId'   => $n['author_id'],
        'text'       => $n['text'],
        'visibility' => $n['visibility'],
        'createdAt'  => (int)$n['created_at'],
    ];
}

/* ---------------- Router ---------------- */

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($action) {

        /* ---------- AUTH ---------- */

        case 'auth/login': {
            $b = read_json_body();
            $ident = strtolower(trim($b['identifier'] ?? ''));
            $pass  = $b['password'] ?? '';
            if ($ident === '' || $pass === '') json_err('Faltan credenciales.');
            $stmt = db()->prepare("SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1");
            $stmt->execute([$ident, $ident]);
            $u = $stmt->fetch();
            if (!$u || !password_verify($pass, $u['password_hash'])) {
                json_err('Usuario o contraseña incorrectos.');
            }
            if ($u['status'] === 'pending')  json_out(['ok' => false, 'state' => 'pending',  'error' => 'Tu registro aún no ha sido aprobado.']);
            if ($u['status'] === 'rejected') json_out(['ok' => false, 'state' => 'rejected', 'error' => 'Tu solicitud fue rechazada.']);
            if ($u['status'] === 'inactive') json_out(['ok' => false, 'state' => 'inactive', 'error' => 'Tu cuenta fue dada de baja.']);
            $_SESSION['user_id'] = $u['id'];
            json_out(['ok' => true, 'user' => public_user($u)]);
        }

        case 'auth/register': {
            $b = read_json_body();
            foreach (['name','phone','email','password'] as $k) {
                if (empty(trim((string)($b[$k] ?? '')))) json_err('Faltan campos obligatorios.');
            }
            $email = strtolower(trim($b['email']));
            $exists = db()->prepare("SELECT 1 FROM users WHERE LOWER(email) = ? LIMIT 1");
            $exists->execute([$email]);
            if ($exists->fetch()) json_err('Ese correo ya está registrado.');

            // Username: el usuario puede elegirlo (recomendado); si no viene, lo auto-generamos desde el correo
            $provided = trim((string)($b['username'] ?? ''));
            if ($provided !== '') {
                if (!preg_match('/^[a-zA-Z0-9._-]{3,20}$/', $provided)) {
                    json_err('Usuario inválido. Usa 3-20 caracteres: letras, números, punto, guion o guion bajo.');
                }
                $chk = db()->prepare("SELECT 1 FROM users WHERE LOWER(username) = ? LIMIT 1");
                $chk->execute([strtolower($provided)]);
                if ($chk->fetch()) json_err('Ese nombre de usuario ya está en uso.');
                $candidate = $provided;
            } else {
                // Fallback: derivamos del correo
                $base = preg_replace('/[^a-z0-9._-]/', '', strtolower(explode('@', $email)[0]));
                if ($base === '') $base = 'usuario';
                $base = substr($base, 0, 20);
                $candidate = $base; $i = 1;
                $chk = db()->prepare("SELECT 1 FROM users WHERE LOWER(username) = ? LIMIT 1");
                while (true) {
                    $chk->execute([strtolower($candidate)]);
                    if (!$chk->fetch()) break;
                    $candidate = $base . $i++;
                    if ($i > 9999) { $candidate = $base . dechex(time()); break; }
                }
            }

            $id = uid();
            $ins = db()->prepare("INSERT INTO users (id, name, phone, email, username, password_hash, role, status, avatar)
                                  VALUES (?, ?, ?, ?, ?, ?, '', 'pending', ?)");
            $ins->execute([
                $id,
                trim($b['name']),
                trim($b['phone']),
                trim($b['email']),
                $candidate,
                password_hash($b['password'], PASSWORD_BCRYPT),
                $b['avatar'] ?? null,
            ]);
            json_out(['ok' => true, 'state' => 'pending', 'user' => [
                'id' => $id, 'name' => trim($b['name']), 'email' => trim($b['email']),
                'username' => $candidate, 'role' => '', 'status' => 'pending',
            ]]);
        }

        case 'auth/me': {
            $u = current_user();
            if (!$u) json_out(['ok' => false], 401);
            json_out(['ok' => true, 'user' => $u]);
        }

        case 'auth/logout': {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time()-42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
            }
            session_destroy();
            json_out(['ok' => true]);
        }

        /* ---------- USERS (listado) ---------- */

        case 'users/list': {
            $me = require_login();
            // Todos los autenticados pueden listar usuarios (frontend filtra por rol)
            $rows = db()->query("SELECT * FROM users ORDER BY created_at DESC")->fetchAll();
            $users = array_map('public_user', $rows);
            json_out(['ok' => true, 'users' => $users]);
        }

        case 'users/update': {
            $me = require_role(['administrador']);
            $b = read_json_body();
            $id = $b['id'] ?? '';
            $patch = $b['patch'] ?? [];
            if (!$id || !is_array($patch)) json_err('Parámetros inválidos.');

            $allowed = ['name','phone','email','username','avatar'];
            $sets = []; $vals = [];
            foreach ($allowed as $k) {
                if (array_key_exists($k, $patch)) {
                    $sets[] = "$k = ?";
                    $vals[] = $patch[$k];
                }
            }
            if (!$sets) json_err('Nada que actualizar.');

            // Unicidad de username/email
            if (isset($patch['username'])) {
                $chk = db()->prepare("SELECT 1 FROM users WHERE LOWER(username) = ? AND id <> ? LIMIT 1");
                $chk->execute([strtolower($patch['username']), $id]);
                if ($chk->fetch()) json_err('Ese usuario ya está en uso.');
            }
            if (isset($patch['email'])) {
                $chk = db()->prepare("SELECT 1 FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1");
                $chk->execute([strtolower($patch['email']), $id]);
                if ($chk->fetch()) json_err('Ese correo ya está en uso.');
            }

            $vals[] = $id;
            $sql = "UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?";
            db()->prepare($sql)->execute($vals);
            json_out(['ok' => true]);
        }

        case 'users/change_role': {
            $me = require_role(['administrador']);
            $b = read_json_body();
            $role = $b['role'] ?? '';
            if (!in_array($role, ['','colaborador','empleador','supervisor','administrador'], true)) {
                json_err('Rol inválido.');
            }
            db()->prepare("UPDATE users SET role = ? WHERE id = ?")->execute([$role, $b['id'] ?? '']);
            json_out(['ok' => true]);
        }

        case 'users/change_status': {
            $me = require_role(['administrador']);
            $b = read_json_body();
            $st = $b['status'] ?? '';
            if (!in_array($st, ['pending','approved','rejected','inactive'], true)) {
                json_err('Estado inválido.');
            }
            db()->prepare("UPDATE users SET status = ? WHERE id = ?")->execute([$st, $b['id'] ?? '']);
            json_out(['ok' => true]);
        }

        case 'users/set_theme': {
            $me = require_login();
            $b = read_json_body();
            $t = $b['theme'] ?? '';
            if (!in_array($t, ['light','aster'], true)) json_err('Tema inválido.');
            db()->prepare("UPDATE users SET theme = ? WHERE id = ?")->execute([$t, $me['id']]);
            json_out(['ok' => true, 'theme' => $t]);
        }

        case 'users/reset_password': {
            $me = require_role(['administrador']);
            $b = read_json_body();
            $p = $b['password'] ?? '';
            if (strlen($p) < 6) json_err('La contraseña debe tener al menos 6 caracteres.');
            db()->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
                ->execute([password_hash($p, PASSWORD_BCRYPT), $b['id'] ?? '']);
            json_out(['ok' => true]);
        }

        case 'users/delete': {
            $me = require_role(['administrador']);
            $b = read_json_body();
            $id = $b['id'] ?? '';
            if ($id === $me['id']) json_err('No puedes eliminarte a ti mismo.');
            db()->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
            json_out(['ok' => true]);
        }

        /* ---------- TASKS ---------- */

        case 'tasks/list': {
            $me = require_login();
            $rows = db()->query("SELECT * FROM tasks ORDER BY created_at DESC")->fetchAll();
            // Prefetch notes por task
            $ids = array_column($rows, 'id');
            $notesByTask = [];
            if ($ids) {
                $place = implode(',', array_fill(0, count($ids), '?'));
                $ns = db()->prepare("SELECT * FROM task_notes WHERE task_id IN ($place) ORDER BY created_at ASC");
                $ns->execute($ids);
                foreach ($ns->fetchAll() as $n) {
                    $notesByTask[$n['task_id']][] = public_note($n);
                }
            }
            $tasks = array_map(fn($t) => public_task($t, $notesByTask[$t['id']] ?? []), $rows);
            json_out(['ok' => true, 'tasks' => $tasks]);
        }

        case 'tasks/create': {
            $me = require_login();
            $b = read_json_body();
            $name = trim((string)($b['name'] ?? ''));
            if ($name === '') json_err('El nombre es obligatorio.');
            $status = in_array($b['status'] ?? '', ['trabajando','revision','realizada','cancelado'], true)
                ? $b['status'] : 'trabajando';
            $id = uid();
            $now = (int)(microtime(true)*1000);
            $uidTarget = $b['userId'] ?? $me['id'];
            // Un colaborador solo puede crear para sí mismo
            if ($me['role'] === 'colaborador' && $uidTarget !== $me['id']) $uidTarget = $me['id'];
            $sql = "INSERT INTO tasks (id, user_id, name, start_time, end_time, time_spent, comments, status, done, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            db()->prepare($sql)->execute([
                $id, $uidTarget, $name,
                $b['start'] ?? null, $b['end'] ?? null, $b['time'] ?? null,
                $b['comments'] ?? null,
                $status, $status === 'realizada' ? 1 : 0,
                $now, $now
            ]);
            json_out(['ok' => true, 'task' => [
                'id' => $id, 'userId' => $uidTarget, 'name' => $name,
                'start' => $b['start'] ?? null, 'end' => $b['end'] ?? null,
                'time' => $b['time'] ?? null, 'comments' => $b['comments'] ?? null,
                'status' => $status, 'done' => $status === 'realizada',
                'createdAt' => $now, 'updatedAt' => $now, 'notes' => [],
            ]]);
        }

        case 'tasks/update': {
            $me = require_login();
            $b = read_json_body();
            $id = $b['id'] ?? '';
            $patch = is_array($b['patch'] ?? null) ? $b['patch'] : [];
            if (!$id) json_err('Id requerido.');

            $stmt = db()->prepare("SELECT * FROM tasks WHERE id = ?");
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t) json_err('Tarea no encontrada.', 404);
            // Permiso: dueño, empleador o admin
            if ($t['user_id'] !== $me['id'] && !in_array($me['role'], ['empleador','administrador'], true)) {
                json_err('No autorizado', 403);
            }

            $map = [
                'name'     => 'name',
                'start'    => 'start_time',
                'end'      => 'end_time',
                'time'     => 'time_spent',
                'comments' => 'comments',
                'status'   => 'status',
                'done'     => 'done',
            ];
            $sets = []; $vals = [];
            foreach ($map as $jsKey => $dbKey) {
                if (array_key_exists($jsKey, $patch)) {
                    if ($jsKey === 'status' && !in_array($patch[$jsKey], ['trabajando','revision','realizada','cancelado'], true)) continue;
                    $sets[] = "$dbKey = ?";
                    $vals[] = $jsKey === 'done' ? (int)!!$patch[$jsKey] : $patch[$jsKey];
                }
            }
            // Si cambió el estado, mantener coherente "done"
            if (isset($patch['status'])) {
                $sets[] = "done = ?";
                $vals[] = $patch['status'] === 'realizada' ? 1 : 0;
            }
            if (!$sets) json_err('Nada que actualizar.');

            $sets[] = "updated_at = ?";
            $vals[] = (int)(microtime(true)*1000);
            $vals[] = $id;
            db()->prepare("UPDATE tasks SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
            json_out(['ok' => true]);
        }

        case 'tasks/delete': {
            $me = require_login();
            $b = read_json_body();
            $id = $b['id'] ?? '';
            $stmt = db()->prepare("SELECT user_id FROM tasks WHERE id = ?");
            $stmt->execute([$id]);
            $t = $stmt->fetch();
            if (!$t) json_out(['ok' => true]); // ya no existe
            if ($t['user_id'] !== $me['id'] && !in_array($me['role'], ['empleador','administrador'], true)) {
                json_err('No autorizado', 403);
            }
            db()->prepare("DELETE FROM tasks WHERE id = ?")->execute([$id]);
            json_out(['ok' => true]);
        }

        /* ---------- NOTES ---------- */

        case 'notes/add': {
            $me = require_role(['empleador','administrador']);
            $b = read_json_body();
            $taskId = $b['task_id'] ?? '';
            $text = trim((string)($b['text'] ?? ''));
            $vis = in_array($b['visibility'] ?? '', ['private','public'], true) ? $b['visibility'] : 'private';
            if ($taskId === '' || $text === '') json_err('Faltan datos.');
            $id = uid();
            $now = (int)(microtime(true)*1000);
            db()->prepare("INSERT INTO task_notes (id, task_id, author_id, text, visibility, created_at)
                           VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$id, $taskId, $me['id'], $text, $vis, $now]);
            json_out(['ok' => true, 'note' => [
                'id' => $id, 'authorId' => $me['id'], 'text' => $text, 'visibility' => $vis, 'createdAt' => $now,
            ], 'taskId' => $taskId]);
        }

        case 'notes/delete': {
            $me = require_role(['empleador','administrador']);
            $b = read_json_body();
            db()->prepare("DELETE FROM task_notes WHERE id = ?")->execute([$b['id'] ?? '']);
            json_out(['ok' => true]);
        }

        default:
            json_err('Acción desconocida: ' . $action, 404);
    }
} catch (Throwable $e) {
    $msg = ($APP_ENV ?? 'production') === 'dev' ? $e->getMessage() : 'Error del servidor.';
    json_err($msg, 500);
}
