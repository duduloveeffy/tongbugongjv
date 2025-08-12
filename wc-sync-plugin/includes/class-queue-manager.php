<?php
/**
 * Queue Manager Class
 * 
 * Handles webhook queue operations
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Realtime_Sync_Queue_Manager {

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
     * Get queue statistics
     */
    public function get_queue_stats() {
        global $wpdb;

        $stats = array();
        
        // Count by status
        $status_counts = $wpdb->get_results(
            "SELECT status, COUNT(*) as count 
             FROM {$wpdb->prefix}wc_realtime_sync_queue 
             GROUP BY status"
        );

        foreach ($status_counts as $row) {
            $stats[$row->status] = (int) $row->count;
        }

        // Recent activity (last 24 hours)
        $recent_activity = $wpdb->get_results(
            "SELECT event_type, COUNT(*) as count 
             FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
             GROUP BY event_type"
        );

        $stats['recent_activity'] = array();
        foreach ($recent_activity as $row) {
            $stats['recent_activity'][$row->event_type] = (int) $row->count;
        }

        // Failed items needing attention
        $stats['failed_items'] = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status = 'failed'"
        );

        // Oldest pending item
        $oldest_pending = $wpdb->get_var(
            "SELECT created_at FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status = 'pending' 
             ORDER BY created_at ASC 
             LIMIT 1"
        );

        $stats['oldest_pending'] = $oldest_pending;

        return $stats;
    }

    /**
     * Get queue items with pagination
     */
    public function get_queue_items($args = array()) {
        global $wpdb;

        $defaults = array(
            'status' => '',
            'event_type' => '',
            'limit' => 20,
            'offset' => 0,
            'order_by' => 'created_at',
            'order' => 'DESC',
        );

        $args = wp_parse_args($args, $defaults);

        $where_conditions = array('1=1');
        $where_values = array();

        if (!empty($args['status'])) {
            $where_conditions[] = 'status = %s';
            $where_values[] = $args['status'];
        }

        if (!empty($args['event_type'])) {
            $where_conditions[] = 'event_type = %s';
            $where_values[] = $args['event_type'];
        }

        $where_clause = implode(' AND ', $where_conditions);

        $order_clause = sprintf(
            'ORDER BY %s %s',
            esc_sql($args['order_by']),
            esc_sql($args['order'])
        );

        $limit_clause = sprintf('LIMIT %d OFFSET %d', $args['limit'], $args['offset']);

        $query = "SELECT * FROM {$wpdb->prefix}wc_realtime_sync_queue 
                  WHERE $where_clause 
                  $order_clause 
                  $limit_clause";

        if (!empty($where_values)) {
            $query = $wpdb->prepare($query, $where_values);
        }

        $items = $wpdb->get_results($query);

        // Get total count
        $count_query = "SELECT COUNT(*) FROM {$wpdb->prefix}wc_realtime_sync_queue WHERE $where_clause";
        if (!empty($where_values)) {
            $count_query = $wpdb->prepare($count_query, $where_values);
        }
        $total = (int) $wpdb->get_var($count_query);

        return array(
            'items' => $items,
            'total' => $total,
        );
    }

    /**
     * Retry failed webhook
     */
    public function retry_webhook($webhook_id) {
        global $wpdb;

        $webhook = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}wc_realtime_sync_queue WHERE id = %d",
            $webhook_id
        ));

        if (!$webhook) {
            return new WP_Error('webhook_not_found', __('Webhook not found.', 'wc-realtime-sync'));
        }

        if ($webhook->status !== 'failed') {
            return new WP_Error('webhook_not_failed', __('Only failed webhooks can be retried.', 'wc-realtime-sync'));
        }

        // Reset webhook for retry
        $result = $wpdb->update(
            $wpdb->prefix . 'wc_realtime_sync_queue',
            array(
                'status' => 'pending',
                'attempts' => 0,
                'error_message' => null,
                'scheduled_at' => current_time('mysql'),
            ),
            array('id' => $webhook_id),
            array('%s', '%d', '%s', '%s'),
            array('%d')
        );

        if ($result === false) {
            return new WP_Error('retry_failed', __('Failed to retry webhook.', 'wc-realtime-sync'));
        }

        // Schedule immediate processing
        wp_schedule_single_event(time() + 5, 'wc_realtime_sync_process_queue');

        return true;
    }

    /**
     * Bulk retry failed webhooks
     */
    public function bulk_retry_failed($limit = 50) {
        global $wpdb;

        $result = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->prefix}wc_realtime_sync_queue 
             SET status = 'pending', 
                 attempts = 0, 
                 error_message = NULL,
                 scheduled_at = NOW()
             WHERE status = 'failed' 
             LIMIT %d",
            $limit
        ));

        if ($result === false) {
            return new WP_Error('bulk_retry_failed', __('Failed to retry webhooks.', 'wc-realtime-sync'));
        }

        // Schedule processing
        wp_schedule_single_event(time() + 5, 'wc_realtime_sync_process_queue');

        return $result;
    }

    /**
     * Delete webhook from queue
     */
    public function delete_webhook($webhook_id) {
        global $wpdb;

        $result = $wpdb->delete(
            $wpdb->prefix . 'wc_realtime_sync_queue',
            array('id' => $webhook_id),
            array('%d')
        );

        return $result !== false;
    }

    /**
     * Clear completed webhooks
     */
    public function clear_completed($older_than_days = 7) {
        global $wpdb;

        $result = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status = 'completed' 
             AND processed_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
            $older_than_days
        ));

        return $result;
    }

    /**
     * Clear failed webhooks
     */
    public function clear_failed($older_than_days = 30) {
        global $wpdb;

        $result = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status = 'failed' 
             AND processed_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
            $older_than_days
        ));

        return $result;
    }

    /**
     * Get webhook logs
     */
    public function get_webhook_logs($args = array()) {
        global $wpdb;

        $defaults = array(
            'event_type' => '',
            'http_status' => '',
            'limit' => 50,
            'offset' => 0,
            'order_by' => 'created_at',
            'order' => 'DESC',
        );

        $args = wp_parse_args($args, $defaults);

        $where_conditions = array('1=1');
        $where_values = array();

        if (!empty($args['event_type'])) {
            $where_conditions[] = 'event_type = %s';
            $where_values[] = $args['event_type'];
        }

        if (!empty($args['http_status'])) {
            $where_conditions[] = 'http_status = %d';
            $where_values[] = $args['http_status'];
        }

        $where_clause = implode(' AND ', $where_conditions);

        $order_clause = sprintf(
            'ORDER BY %s %s',
            esc_sql($args['order_by']),
            esc_sql($args['order'])
        );

        $limit_clause = sprintf('LIMIT %d OFFSET %d', $args['limit'], $args['offset']);

        $query = "SELECT * FROM {$wpdb->prefix}wc_realtime_sync_log 
                  WHERE $where_clause 
                  $order_clause 
                  $limit_clause";

        if (!empty($where_values)) {
            $query = $wpdb->prepare($query, $where_values);
        }

        $logs = $wpdb->get_results($query);

        // Get total count
        $count_query = "SELECT COUNT(*) FROM {$wpdb->prefix}wc_realtime_sync_log WHERE $where_clause";
        if (!empty($where_values)) {
            $count_query = $wpdb->prepare($count_query, $where_values);
        }
        $total = (int) $wpdb->get_var($count_query);

        return array(
            'logs' => $logs,
            'total' => $total,
        );
    }

    /**
     * Get webhook logs statistics
     */
    public function get_log_stats($days = 7) {
        global $wpdb;

        $stats = array();

        // Success rate
        $success_rate = $wpdb->get_row($wpdb->prepare(
            "SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN http_status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) as successful
             FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL %d DAY)",
            $days
        ));

        if ($success_rate->total > 0) {
            $stats['success_rate'] = round(($success_rate->successful / $success_rate->total) * 100, 2);
        } else {
            $stats['success_rate'] = 0;
        }

        $stats['total_attempts'] = (int) $success_rate->total;
        $stats['successful_attempts'] = (int) $success_rate->successful;

        // Average response time
        $avg_time = $wpdb->get_var($wpdb->prepare(
            "SELECT AVG(execution_time) 
             FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL %d DAY)
             AND execution_time IS NOT NULL",
            $days
        ));

        $stats['avg_response_time'] = $avg_time ? round($avg_time, 3) : 0;

        // Most common errors
        $common_errors = $wpdb->get_results($wpdb->prepare(
            "SELECT http_status, COUNT(*) as count
             FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL %d DAY)
             AND http_status NOT BETWEEN 200 AND 299
             GROUP BY http_status
             ORDER BY count DESC
             LIMIT 5",
            $days
        ));

        $stats['common_errors'] = $common_errors;

        // Activity by event type
        $event_activity = $wpdb->get_results($wpdb->prepare(
            "SELECT event_type, COUNT(*) as count
             FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL %d DAY)
             GROUP BY event_type
             ORDER BY count DESC",
            $days
        ));

        $stats['event_activity'] = $event_activity;

        return $stats;
    }

    /**
     * Clear old logs
     */
    public function clear_old_logs($older_than_days = 30) {
        global $wpdb;

        $result = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
            $older_than_days
        ));

        return $result;
    }

    /**
     * Test webhook endpoint
     */
    public function test_webhook_endpoint($endpoint, $secret_key = '') {
        $test_payload = array(
            'event' => 'test.webhook',
            'timestamp' => current_time('timestamp'),
            'site_url' => home_url(),
            'test_data' => array(
                'message' => 'This is a test webhook from WooCommerce Realtime Sync',
                'plugin_version' => WC_REALTIME_SYNC_VERSION,
                'wordpress_version' => get_bloginfo('version'),
                'woocommerce_version' => WC_VERSION,
            ),
        );

        $payload_json = wp_json_encode($test_payload);

        $headers = array(
            'Content-Type' => 'application/json',
            'User-Agent' => 'WC-Realtime-Sync/' . WC_REALTIME_SYNC_VERSION,
            'X-WC-Event' => 'test.webhook',
            'X-WC-Source' => home_url(),
            'X-WC-Timestamp' => time(),
        );

        // Add signature if secret key is provided
        if (!empty($secret_key)) {
            $security = WC_Realtime_Sync_Security::get_instance();
            $signature = $security->generate_signature($payload_json, $secret_key);
            $headers['X-WC-Signature'] = $signature;
        }

        $start_time = microtime(true);
        $response = wp_remote_post($endpoint, array(
            'headers' => $headers,
            'body' => $payload_json,
            'timeout' => 30,
            'sslverify' => true,
            'redirection' => 0,
        ));
        $execution_time = microtime(true) - $start_time;

        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'error' => $response->get_error_message(),
                'execution_time' => $execution_time,
            );
        }

        $http_status = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        return array(
            'success' => $http_status >= 200 && $http_status < 300,
            'http_status' => $http_status,
            'response_body' => $response_body,
            'execution_time' => $execution_time,
            'headers' => wp_remote_retrieve_headers($response),
        );
    }
}