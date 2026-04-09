CREATE TABLE clients (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255),
  code VARCHAR(10),
  concept TEXT,
  summary TEXT,
  kickoff_date DATE,
  ext_json JSON,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE tasks (
  id VARCHAR(36) PRIMARY KEY,
  task_code VARCHAR(20),
  client_id VARCHAR(36),
  task_name VARCHAR(255),
  owner VARCHAR(50),
  status VARCHAR(50),
  priority VARCHAR(50),
  task_type ENUM('puntual','mensual'),
  task_month VARCHAR(7),
  month_status ENUM('abierto','cerrado'),
  template_id VARCHAR(36),
  due_date DATE,
  start_date DATE,
  end_date DATE,
  description TEXT,
  attachments_json JSON,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE templates (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36),
  template_name VARCHAR(255),
  owner VARCHAR(50),
  priority VARCHAR(50),
  status_default VARCHAR(50),
  due_day INT,
  is_active BOOLEAN,
  description TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE client_months (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36),
  task_month VARCHAR(7),
  month_status ENUM('abierto','cerrado'),
  generated_at DATETIME,
  closed_at DATETIME,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE comments (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36),
  author VARCHAR(50),
  text TEXT,
  created_at DATETIME
);
