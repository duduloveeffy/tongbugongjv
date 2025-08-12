<?php
/**
 * Security Class
 * 
 * Handles webhook security features
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Realtime_Sync_Security {

    /**
     * Instance
     */
    private static $instance = null;

    /**
     * Get instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Generate HMAC signature for webhook payload
     */
    public function generate_signature($payload, $secret_key) {
        return 'sha256=' . hash_hmac('sha256', $payload, $secret_key);
    }

    /**
     * Verify webhook signature
     */
    public function verify_signature($payload, $signature, $secret_key) {
        $expected_signature = $this->generate_signature($payload, $secret_key);
        return hash_equals($expected_signature, $signature);
    }

    /**
     * Generate secure random secret key
     */
    public function generate_secret_key($length = 32) {
        return wp_generate_password($length, false);
    }

    /**
     * Validate webhook endpoint URL
     */
    public function validate_endpoint_url($url) {
        // Basic URL validation
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return new WP_Error('invalid_url', __('Invalid URL format.', 'wc-realtime-sync'));
        }

        $parsed_url = wp_parse_url($url);

        // Require HTTPS for production
        if (!WP_DEBUG && $parsed_url['scheme'] !== 'https') {
            return new WP_Error('require_https', __('HTTPS is required for webhook endpoints.', 'wc-realtime-sync'));
        }

        // Block local/private IPs in production
        if (!WP_DEBUG) {
            $ip = gethostbyname($parsed_url['host']);
            if ($this->is_private_ip($ip)) {
                return new WP_Error('private_ip', __('Private IP addresses are not allowed.', 'wc-realtime-sync'));
            }
        }

        // Block suspicious domains
        $blocked_domains = apply_filters('wc_realtime_sync_blocked_domains', array(
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
        ));

        if (in_array($parsed_url['host'], $blocked_domains)) {
            return new WP_Error('blocked_domain', __('This domain is not allowed.', 'wc-realtime-sync'));
        }

        return true;
    }

    /**
     * Check if IP is private/local
     */
    private function is_private_ip($ip) {
        return !filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        );
    }

    /**
     * Sanitize webhook settings
     */
    public function sanitize_settings($settings) {
        $sanitized = array();

        // Webhook endpoint
        if (isset($settings['webhook_endpoint'])) {
            $sanitized['webhook_endpoint'] = esc_url_raw($settings['webhook_endpoint']);
        }

        // Secret key
        if (isset($settings['secret_key'])) {
            $sanitized['secret_key'] = sanitize_text_field($settings['secret_key']);
        }

        // Boolean settings
        $boolean_fields = array('enabled', 'debug_mode');
        foreach ($boolean_fields as $field) {
            if (isset($settings[$field])) {
                $sanitized[$field] = (bool) $settings[$field];
            }
        }

        // Integer settings
        $integer_fields = array('retry_attempts', 'timeout', 'batch_size');
        foreach ($integer_fields as $field) {
            if (isset($settings[$field])) {
                $sanitized[$field] = absint($settings[$field]);
            }
        }

        // Events array
        if (isset($settings['events']) && is_array($settings['events'])) {
            $sanitized['events'] = array();
            $allowed_events = array(
                'order_created',
                'order_updated', 
                'order_deleted',
                'product_created',
                'product_updated',
                'product_deleted'
            );

            foreach ($allowed_events as $event) {
                if (isset($settings['events'][$event])) {
                    $sanitized['events'][$event] = (bool) $settings['events'][$event];
                }
            }
        }

        return $sanitized;
    }

    /**
     * Rate limiting for webhook attempts
     */
    public function check_rate_limit($endpoint) {
        $transient_key = 'wc_realtime_sync_rate_limit_' . md5($endpoint);
        $attempts = get_transient($transient_key);

        if ($attempts === false) {
            // First attempt
            set_transient($transient_key, 1, MINUTE_IN_SECONDS);
            return true;
        }

        // Allow up to 60 attempts per minute
        if ($attempts >= 60) {
            return false;
        }

        set_transient($transient_key, $attempts + 1, MINUTE_IN_SECONDS);
        return true;
    }

    /**
     * Log security events
     */
    public function log_security_event($event_type, $details = array()) {
        $log_entry = array(
            'timestamp' => current_time('mysql'),
            'event_type' => $event_type,
            'user_ip' => $this->get_client_ip(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
            'details' => $details,
        );

        // Store in option (keep last 100 entries)
        $security_log = get_option('wc_realtime_sync_security_log', array());
        array_unshift($security_log, $log_entry);
        $security_log = array_slice($security_log, 0, 100);
        update_option('wc_realtime_sync_security_log', $security_log);

        // Also log to error log if debug mode is on
        $options = WC_Realtime_Sync::get_options();
        if (!empty($options['debug_mode'])) {
            error_log(sprintf(
                '[WC Realtime Sync Security] %s: %s',
                $event_type,
                wp_json_encode($details)
            ));
        }
    }

    /**
     * Get client IP address
     */
    private function get_client_ip() {
        $ip_headers = array(
            'HTTP_CF_CONNECTING_IP',
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR'
        );

        foreach ($ip_headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                // Handle comma-separated IPs
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return $ip;
                }
            }
        }

        return $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
    }

    /**
     * Encrypt sensitive data
     */
    public function encrypt_data($data, $key = null) {
        if ($key === null) {
            $key = wp_salt('secure_auth');
        }

        $method = 'AES-256-CBC';
        $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length($method));
        $encrypted = openssl_encrypt($data, $method, $key, 0, $iv);
        
        return base64_encode($iv . $encrypted);
    }

    /**
     * Decrypt sensitive data
     */
    public function decrypt_data($encrypted_data, $key = null) {
        if ($key === null) {
            $key = wp_salt('secure_auth');
        }

        $method = 'AES-256-CBC';
        $data = base64_decode($encrypted_data);
        $iv_length = openssl_cipher_iv_length($method);
        $iv = substr($data, 0, $iv_length);
        $encrypted = substr($data, $iv_length);
        
        return openssl_decrypt($encrypted, $method, $key, 0, $iv);
    }

    /**
     * Hash sensitive data for comparison
     */
    public function hash_data($data, $salt = null) {
        if ($salt === null) {
            $salt = wp_salt('nonce');
        }
        
        return hash_hmac('sha256', $data, $salt);
    }

    /**
     * Generate nonce for admin forms
     */
    public function generate_nonce($action = 'wc_realtime_sync_admin') {
        return wp_create_nonce($action);
    }

    /**
     * Verify nonce for admin forms
     */
    public function verify_nonce($nonce, $action = 'wc_realtime_sync_admin') {
        return wp_verify_nonce($nonce, $action);
    }

    /**
     * Check user capabilities
     */
    public function check_admin_capabilities() {
        return current_user_can('manage_woocommerce');
    }

    /**
     * Sanitize and validate test webhook data
     */
    public function validate_test_webhook_data($data) {
        $errors = array();

        // Validate endpoint
        if (empty($data['endpoint'])) {
            $errors[] = __('Webhook endpoint is required.', 'wc-realtime-sync');
        } else {
            $validation = $this->validate_endpoint_url($data['endpoint']);
            if (is_wp_error($validation)) {
                $errors[] = $validation->get_error_message();
            }
        }

        // Validate secret key
        if (!empty($data['secret_key'])) {
            if (strlen($data['secret_key']) < 16) {
                $errors[] = __('Secret key must be at least 16 characters long.', 'wc-realtime-sync');
            }
        }

        return empty($errors) ? true : $errors;
    }
}