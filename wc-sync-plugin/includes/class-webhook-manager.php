<?php
/**
 * Webhook Manager Class
 * 
 * Handles webhook event listening and sending
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Realtime_Sync_Webhook_Manager {

    /**
     * Instance
     */
    private static $instance = null;

    /**
     * Plugin options
     */
    private $options;

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
     * Constructor
     */
    private function __construct() {
        $this->options = WC_Realtime_Sync::get_options();
        $this->init_hooks();
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Only initialize if plugin is enabled
        if (empty($this->options['enabled'])) {
            return;
        }

        // Order hooks
        if (!empty($this->options['events']['order_created'])) {
            add_action('woocommerce_checkout_order_processed', array($this, 'handle_order_created'), 10, 1);
            add_action('woocommerce_new_order', array($this, 'handle_order_created'), 10, 1);
        }

        if (!empty($this->options['events']['order_updated'])) {
            add_action('woocommerce_order_status_changed', array($this, 'handle_order_updated'), 10, 4);
            add_action('woocommerce_update_order', array($this, 'handle_order_updated_general'), 10, 1);
        }

        if (!empty($this->options['events']['order_deleted'])) {
            add_action('wp_trash_post', array($this, 'handle_order_deleted'), 10, 1);
            add_action('before_delete_post', array($this, 'handle_order_deleted'), 10, 1);
        }

        // Product hooks
        if (!empty($this->options['events']['product_created'])) {
            add_action('woocommerce_new_product', array($this, 'handle_product_created'), 10, 1);
        }

        if (!empty($this->options['events']['product_updated'])) {
            add_action('woocommerce_update_product', array($this, 'handle_product_updated'), 10, 1);
            add_action('woocommerce_product_quick_edit_save', array($this, 'handle_product_updated'), 10, 1);
            add_action('woocommerce_process_product_meta', array($this, 'handle_product_updated'), 20, 1);
        }

        if (!empty($this->options['events']['product_deleted'])) {
            add_action('wp_trash_post', array($this, 'handle_product_deleted'), 10, 1);
            add_action('before_delete_post', array($this, 'handle_product_deleted'), 10, 1);
        }

        // Process webhook queue
        add_action('wc_realtime_sync_process_queue', array($this, 'process_queue'));
        
        // Schedule queue processing if not already scheduled
        if (!wp_next_scheduled('wc_realtime_sync_process_queue')) {
            wp_schedule_event(time(), 'every_minute', 'wc_realtime_sync_process_queue');
        }

        // Cleanup old logs
        add_action('wc_realtime_sync_cleanup', array($this, 'cleanup_logs'));
    }

    /**
     * Handle order created event
     */
    public function handle_order_created($order_id) {
        $this->log_debug("Order created: $order_id");
        $this->queue_webhook('order.created', $order_id, 'order');
    }

    /**
     * Handle order status changed event
     */
    public function handle_order_updated($order_id, $old_status, $new_status, $order) {
        $this->log_debug("Order status changed: $order_id from $old_status to $new_status");
        $this->queue_webhook('order.updated', $order_id, 'order');
    }

    /**
     * Handle general order updated event
     */
    public function handle_order_updated_general($order_id) {
        $this->log_debug("Order updated: $order_id");
        $this->queue_webhook('order.updated', $order_id, 'order');
    }

    /**
     * Handle order deleted event
     */
    public function handle_order_deleted($post_id) {
        if (get_post_type($post_id) === 'shop_order') {
            $this->log_debug("Order deleted: $post_id");
            $this->queue_webhook('order.deleted', $post_id, 'order');
        }
    }

    /**
     * Handle product created event
     */
    public function handle_product_created($product_id) {
        $this->log_debug("Product created: $product_id");
        $this->queue_webhook('product.created', $product_id, 'product');
    }

    /**
     * Handle product updated event
     */
    public function handle_product_updated($product_id) {
        $this->log_debug("Product updated: $product_id");
        $this->queue_webhook('product.updated', $product_id, 'product');
    }

    /**
     * Handle product deleted event
     */
    public function handle_product_deleted($post_id) {
        if (get_post_type($post_id) === 'product') {
            $this->log_debug("Product deleted: $post_id");
            $this->queue_webhook('product.deleted', $post_id, 'product');
        }
    }

    /**
     * Queue webhook for processing
     */
    private function queue_webhook($event_type, $object_id, $object_type) {
        global $wpdb;

        // Check if webhook endpoint is configured
        if (empty($this->options['webhook_endpoint'])) {
            $this->log_debug("Webhook endpoint not configured, skipping event: $event_type");
            return;
        }

        // Check for duplicate recent events (prevent spam)
        $recent_duplicate = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE event_type = %s AND object_id = %d AND object_type = %s 
             AND created_at > %s AND status IN ('pending', 'processing')
             ORDER BY created_at DESC LIMIT 1",
            $event_type,
            $object_id,
            $object_type,
            date('Y-m-d H:i:s', strtotime('-5 minutes'))
        ));

        if ($recent_duplicate) {
            $this->log_debug("Duplicate event within 5 minutes, skipping: $event_type for $object_type $object_id");
            return;
        }

        // Prepare payload
        $payload = $this->prepare_payload($event_type, $object_id, $object_type);
        if (!$payload) {
            $this->log_debug("Failed to prepare payload for: $event_type");
            return;
        }

        // Insert into queue
        $result = $wpdb->insert(
            $wpdb->prefix . 'wc_realtime_sync_queue',
            array(
                'event_type' => $event_type,
                'object_id' => $object_id,
                'object_type' => $object_type,
                'payload' => wp_json_encode($payload),
                'status' => 'pending',
                'max_attempts' => $this->options['retry_attempts'] ?? 3,
                'created_at' => current_time('mysql'),
                'scheduled_at' => current_time('mysql')
            ),
            array('%s', '%d', '%s', '%s', '%s', '%d', '%s', '%s')
        );

        if ($result === false) {
            $this->log_debug("Failed to queue webhook: " . $wpdb->last_error);
        } else {
            $this->log_debug("Queued webhook: $event_type for $object_type $object_id");
            
            // Process immediately if queue is small
            $queue_count = $wpdb->get_var(
                "SELECT COUNT(*) FROM {$wpdb->prefix}wc_realtime_sync_queue WHERE status = 'pending'"
            );
            
            if ($queue_count <= 5) {
                wp_schedule_single_event(time() + 10, 'wc_realtime_sync_process_queue');
            }
        }
    }

    /**
     * Prepare payload for webhook
     */
    private function prepare_payload($event_type, $object_id, $object_type) {
        $formatter = WC_Realtime_Sync_Data_Formatter::get_instance();
        
        switch ($object_type) {
            case 'order':
                return $formatter->format_order_data($object_id, $event_type);
            case 'product':
                return $formatter->format_product_data($object_id, $event_type);
            default:
                return null;
        }
    }

    /**
     * Process webhook queue
     */
    public function process_queue() {
        global $wpdb;

        $this->log_debug("Processing webhook queue...");

        // Get pending webhooks
        $webhooks = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status = 'pending' AND scheduled_at <= %s 
             ORDER BY created_at ASC 
             LIMIT %d",
            current_time('mysql'),
            $this->options['batch_size'] ?? 10
        ));

        if (empty($webhooks)) {
            $this->log_debug("No pending webhooks to process");
            return;
        }

        foreach ($webhooks as $webhook) {
            $this->process_single_webhook($webhook);
        }
    }

    /**
     * Process single webhook
     */
    private function process_single_webhook($webhook) {
        global $wpdb;

        $this->log_debug("Processing webhook ID: {$webhook->id}, Event: {$webhook->event_type}");

        // Mark as processing
        $wpdb->update(
            $wpdb->prefix . 'wc_realtime_sync_queue',
            array('status' => 'processing'),
            array('id' => $webhook->id)
        );

        // Send webhook
        $start_time = microtime(true);
        $response = $this->send_webhook($webhook);
        $execution_time = microtime(true) - $start_time;

        // Log the attempt
        $this->log_webhook_attempt($webhook, $response, $execution_time);

        if ($response['success']) {
            // Mark as completed
            $wpdb->update(
                $wpdb->prefix . 'wc_realtime_sync_queue',
                array(
                    'status' => 'completed',
                    'processed_at' => current_time('mysql')
                ),
                array('id' => $webhook->id)
            );
            
            $this->log_debug("Webhook completed successfully: {$webhook->id}");
        } else {
            // Handle failure
            $attempts = $webhook->attempts + 1;
            
            if ($attempts >= $webhook->max_attempts) {
                // Max attempts reached
                $wpdb->update(
                    $wpdb->prefix . 'wc_realtime_sync_queue',
                    array(
                        'status' => 'failed',
                        'attempts' => $attempts,
                        'error_message' => $response['error'],
                        'processed_at' => current_time('mysql')
                    ),
                    array('id' => $webhook->id)
                );
                
                $this->log_debug("Webhook failed permanently: {$webhook->id}");
            } else {
                // Schedule retry with exponential backoff
                $retry_delay = pow(2, $attempts) * 60; // 2, 4, 8 minutes
                $scheduled_at = date('Y-m-d H:i:s', time() + $retry_delay);
                
                $wpdb->update(
                    $wpdb->prefix . 'wc_realtime_sync_queue',
                    array(
                        'status' => 'pending',
                        'attempts' => $attempts,
                        'error_message' => $response['error'],
                        'scheduled_at' => $scheduled_at
                    ),
                    array('id' => $webhook->id)
                );
                
                $this->log_debug("Webhook retry scheduled: {$webhook->id}, Attempt: $attempts");
            }
        }
    }

    /**
     * Send webhook
     */
    private function send_webhook($webhook) {
        $endpoint = $this->options['webhook_endpoint'];
        $timeout = $this->options['timeout'] ?? 30;
        
        // Prepare headers
        $headers = array(
            'Content-Type' => 'application/json',
            'User-Agent' => 'WC-Realtime-Sync/' . WC_REALTIME_SYNC_VERSION,
            'X-WC-Event' => $webhook->event_type,
            'X-WC-Source' => home_url(),
            'X-WC-Timestamp' => time(),
        );

        // Add signature if secret key is set
        if (!empty($this->options['secret_key'])) {
            $security = WC_Realtime_Sync_Security::get_instance();
            $signature = $security->generate_signature($webhook->payload, $this->options['secret_key']);
            $headers['X-WC-Signature'] = $signature;
        }

        // Send request
        $response = wp_remote_post($endpoint, array(
            'headers' => $headers,
            'body' => $webhook->payload,
            'timeout' => $timeout,
            'sslverify' => true,
            'redirection' => 0,
        ));

        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'error' => $response->get_error_message(),
                'http_status' => 0,
                'response_body' => ''
            );
        }

        $http_status = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        return array(
            'success' => $http_status >= 200 && $http_status < 300,
            'error' => $http_status >= 200 && $http_status < 300 ? '' : "HTTP $http_status",
            'http_status' => $http_status,
            'response_body' => $response_body
        );
    }

    /**
     * Log webhook attempt
     */
    private function log_webhook_attempt($webhook, $response, $execution_time) {
        global $wpdb;

        $wpdb->insert(
            $wpdb->prefix . 'wc_realtime_sync_log',
            array(
                'event_type' => $webhook->event_type,
                'object_id' => $webhook->object_id,
                'object_type' => $webhook->object_type,
                'webhook_endpoint' => $this->options['webhook_endpoint'],
                'http_status' => $response['http_status'],
                'response_body' => substr($response['response_body'], 0, 1000), // Limit length
                'execution_time' => $execution_time,
                'created_at' => current_time('mysql')
            ),
            array('%s', '%d', '%s', '%s', '%d', '%s', '%f', '%s')
        );
    }

    /**
     * Cleanup old logs
     */
    public function cleanup_logs() {
        global $wpdb;

        $days_to_keep = 30;

        // Delete old queue entries
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wc_realtime_sync_queue 
             WHERE status IN ('completed', 'failed') 
             AND processed_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
            $days_to_keep
        ));

        // Delete old log entries
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}wc_realtime_sync_log 
             WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
            $days_to_keep
        ));

        $this->log_debug("Cleaned up old webhook logs and queue entries");
    }

    /**
     * Debug logging
     */
    private function log_debug($message) {
        if (!empty($this->options['debug_mode'])) {
            error_log("[WC Realtime Sync] $message");
        }
    }
}