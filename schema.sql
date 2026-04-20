-- Esquema de la base de datos para Control de Tareas Diarias (Aster)
-- Se ejecuta desde install.php

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(160) NOT NULL UNIQUE,
  username VARCHAR(40) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('','colaborador','empleador','supervisor','administrador') NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected','inactive') NOT NULL DEFAULT 'pending',
  avatar LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  name VARCHAR(200) NOT NULL,
  start_time VARCHAR(10),
  end_time VARCHAR(10),
  time_spent VARCHAR(10),
  comments TEXT,
  status ENUM('trabajando','revision','realizada','cancelado') DEFAULT 'trabajando',
  done TINYINT(1) DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_notes (
  id VARCHAR(32) PRIMARY KEY,
  task_id VARCHAR(32) NOT NULL,
  author_id VARCHAR(32) NULL,
  text TEXT NOT NULL,
  visibility ENUM('private','public') DEFAULT 'private',
  created_at BIGINT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
