<?php
/**
 * Script de instalación de un solo uso.
 *
 * 1. Sube el proyecto a Hostinger.
 * 2. Crea `config.php` a partir de `config.example.php` con tus credenciales.
 * 3. Abre https://tu-dominio.com/install.php
 * 4. **Borra este archivo** una vez que veas "Instalación completa".
 */

header('Content-Type: text/html; charset=utf-8');

require_once __DIR__ . '/config.php';

$html = function ($msg, $ok = true) {
    $color = $ok ? '#4fe1a7' : '#ff6b6b';
    echo "<p style='color:$color;font-family:system-ui;margin:6px 0'>" . htmlspecialchars($msg) . "</p>";
};

?>
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Instalación · Aster</title>
<style>
body{background:#02061f;color:#dbeeff;font-family:system-ui;padding:32px;max-width:720px;margin:0 auto}
h1{color:#fff}
code{background:rgba(61,139,255,0.18);padding:2px 6px;border-radius:6px}
</style></head><body>
<h1>🛠️ Instalación de Aster</h1>
<?php

try {
    $dsn = "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4";
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $html("✓ Conexión con la base `$DB_NAME` establecida.");
} catch (Throwable $e) {
    $html("✗ No se pudo conectar: " . $e->getMessage(), false);
    exit;
}

// 1. Ejecutar schema.sql
try {
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    // Partir por punto y coma respetando bloques
    $stmts = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($stmts as $s) {
        if ($s !== '') $pdo->exec($s);
    }
    $html("✓ Tablas creadas (users, tasks, task_notes).");
} catch (Throwable $e) {
    $html("✗ Error ejecutando schema.sql: " . $e->getMessage(), false);
    exit;
}

// 2. Insertar usuarios semilla si no existen aún
$seed = [
    ['u_admin',  'Admin General',      '+52 5500000000', 'admin@orbital.app',  'admin',  'admin123',  'administrador'],
    ['u_laura',  'Laura Empleador',    '+52 5511111111', 'laura@orbital.app',  'laura',  'laura123',  'empleador'],
    ['u_sergio', 'Sergio Supervisor',  '+52 5522222222', 'sergio@orbital.app', 'sergio', 'sergio123', 'supervisor'],
    ['u_carlos', 'Carlos Colaborador', '+52 5533333333', 'carlos@orbital.app', 'carlos', 'carlos123', 'colaborador'],
];

$ins = $pdo->prepare("INSERT IGNORE INTO users (id, name, phone, email, username, password_hash, role, status, avatar)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', NULL)");

foreach ($seed as [$id, $name, $phone, $email, $username, $pass, $role]) {
    $hash = password_hash($pass, PASSWORD_BCRYPT);
    $ins->execute([$id, $name, $phone, $email, $username, $hash, $role]);
}
$html("✓ Usuarios semilla insertados (o ya existían).");

// 3. Tareas demo del colaborador
$demoTasks = [
    ['t_demo1', 'u_carlos', 'Revisar reportes diarios', '09:00', '10:30', '01:30', 'Validar métricas del sistema.', 'trabajando', 0],
    ['t_demo2', 'u_carlos', 'Calibrar sensores',        '08:15', '09:00', '00:45', 'Estación norte.',                'realizada',  1],
];
$tins = $pdo->prepare("INSERT IGNORE INTO tasks
  (id, user_id, name, start_time, end_time, time_spent, comments, status, done, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$now = (int)(microtime(true) * 1000);
foreach ($demoTasks as $t) {
    $tins->execute(array_merge($t, [$now, $now]));
}
$html("✓ Tareas demo insertadas.");

echo "<h2 style='color:#8ad4ff'>Instalación completa 🚀</h2>";
echo "<p><strong>IMPORTANTE:</strong> borra este archivo <code>install.php</code> del servidor ahora.</p>";
echo "<p>Usuarios de prueba:</p><ul>";
echo "<li><code>admin / admin123</code></li>";
echo "<li><code>laura / laura123</code></li>";
echo "<li><code>sergio / sergio123</code></li>";
echo "<li><code>carlos / carlos123</code></li>";
echo "</ul>";
?>
</body></html>
