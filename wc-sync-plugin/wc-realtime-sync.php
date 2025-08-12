<?php
/**
 * Plugin Name: WooCommerce Realtime Sync
 * Plugin URI: https://github.com/your-repo/wc-realtime-sync
 * Description: Real-time data synchronization plugin for WooCommerce that sends webhook notifications on order and product changes.
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://yourwebsite.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: wc-realtime-sync
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * WC requires at least: 5.0
 * WC tested up to: 8.5
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('WC_REALTIME_SYNC_VERSION', '1.0.0');
define('WC_REALTIME_SYNC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('WC_REALTIME_SYNC_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Main plugin class
 */
class WC_Realtime_Sync {

    /**
     * Plugin instance
     */
    private static $instance = null;

    /**
     * Get plugin instance
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
        add_action('plugins_loaded', array($this, 'init'));
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }

    /**
     * Initialize plugin
     */
    public function init() {
        // Check if WooCommerce is active
        if (!class_exists('WooCommerce')) {
            add_action('admin_notices', array($this, 'woocommerce_missing_notice'));
            return;
        }

        // Load plugin classes
        $this->includes();
        $this->init_hooks();
    }

    /**
     * Include required files
     */
    private function includes() {
        require_once WC_REALTIME_SYNC_PLUGIN_PATH . 'includes/class-webhook-manager.php';
        require_once WC_REALTIME_SYNC_PLUGIN_PATH . 'includes/class-data-formatter.php';
        require_once WC_REALTIME_SYNC_PLUGIN_PATH . 'includes/class-security.php';
        require_once WC_REALTIME_SYNC_PLUGIN_PATH . 'includes/class-queue-manager.php';
        
        if (is_admin()) {
            require_once WC_REALTIME_SYNC_PLUGIN_PATH . 'admin/class-admin.php';
        }
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Initialize webhook manager
        WC_Realtime_Sync_Webhook_Manager::get_instance();
        
        // Initialize admin if in admin area
        if (is_admin()) {
            WC_Realtime_Sync_Admin::get_instance();
        }

        // Load text domain
        add_action('init', array($this, 'load_textdomain'));
    }

    /**
     * Load plugin text domain
     */
    public function load_textdomain() {
        load_plugin_textdomain(
            'wc-realtime-sync',
            false,
            dirname(plugin_basename(__FILE__)) . '/languages/'
        );
    }

    /**
     * Plugin activation hook
     */
    public function activate() {
        // Create plugin options with default values
        $default_options = array(
            'webhook_endpoint' => '',
            'secret_key' => wp_generate_password(32, false),
            'enabled' => false,
            'events' => array(
                'order_created' => true,
                'order_updated' => true,
                'order_deleted' => false,
                'product_created' => true,
                'product_updated' => true,
                'product_deleted' => false,
            ),
            'retry_attempts' => 3,
            'timeout' => 30,
            'batch_size' => 10,
            'debug_mode' => false,
        );

        add_option('wc_realtime_sync_options', $default_options);

        // Create webhook queue table
        $this->create_tables();

        // Schedule cleanup cron job
        if (!wp_next_scheduled('wc_realtime_sync_cleanup')) {
            wp_schedule_event(time(), 'daily', 'wc_realtime_sync_cleanup');
        }
    }

    /**
     * Plugin deactivation hook
     */
    public function deactivate() {
        // Clear scheduled events
        wp_clear_scheduled_hook('wc_realtime_sync_cleanup');
        wp_clear_scheduled_hook('wc_realtime_sync_process_queue');
    }

    /**
     * Create plugin tables
     */
    private function create_tables() {
        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}wc_realtime_sync_queue (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_type varchar(50) NOT NULL,
            object_id bigint(20) unsigned NOT NULL,
            object_type varchar(20) NOT NULL,
            payload longtext NOT NULL,
            status varchar(20) DEFAULT 'pending',
            attempts int(11) DEFAULT 0,
            max_attempts int(11) DEFAULT 3,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            scheduled_at datetime DEFAULT CURRENT_TIMESTAMP,
            processed_at datetime NULL,
            error_message text NULL,
            PRIMARY KEY (id),
            KEY status (status),
            KEY scheduled_at (scheduled_at),
            KEY object_id_type (object_id, object_type),
            KEY event_type (event_type)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);

        // Create event log table
        $sql_log = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}wc_realtime_sync_log (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_type varchar(50) NOT NULL,
            object_id bigint(20) unsigned NOT NULL,
            object_type varchar(20) NOT NULL,
            webhook_endpoint varchar(255) NOT NULL,
            http_status int(11) NULL,
            response_body text NULL,
            execution_time float NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY event_type (event_type),
            KEY created_at (created_at),
            KEY http_status (http_status)
        ) $charset_collate;";

        dbDelta($sql_log);
    }

    /**
     * Show admin notice if WooCommerce is not active
     */
    public function woocommerce_missing_notice() {
        ?>
        <div class="notice notice-error">
            <p><?php _e('WooCommerce Realtime Sync requires WooCommerce to be installed and active.', 'wc-realtime-sync'); ?></p>
        </div>
        <?php
    }

    /**
     * Get plugin options
     */
    public static function get_options() {
        return get_option('wc_realtime_sync_options', array());
    }

    /**
     * Update plugin options
     */
    public static function update_options($options) {
        return update_option('wc_realtime_sync_options', $options);
    }
}

// Initialize plugin
WC_Realtime_Sync::get_instance();