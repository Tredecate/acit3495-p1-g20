CREATE TABLE IF NOT EXISTS readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recorded_at DATETIME NOT NULL,
    location VARCHAR(100) NOT NULL,
    metric_type ENUM('temperature_c','humidity_pct','co2_ppm') NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    notes VARCHAR(255) NULL,
    entered_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_metric_location_time (metric_type, location, recorded_at),
    INDEX idx_entered_by (entered_by)
);
