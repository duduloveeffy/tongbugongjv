<?php
/**
 * Admin Class
 * 
 * Handles admin interface and settings
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Realtime_Sync_Admin {

    /**
     * Instance
     */
    private static $instance = null;

    /**
     * Options
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
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'admin_init'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        add_action('wp_ajax_wc_realtime_sync_test_webhook', array($this, 'ajax_test_webhook'));
        add_action('wp_ajax_wc_realtime_sync_retry_webhook', array($this, 'ajax_retry_webhook'));
        add_action('wp_ajax_wc_realtime_sync_clear_queue', array($this, 'ajax_clear_queue'));
        add_action('wp_ajax_wc_realtime_sync_get_queue_stats', array($this, 'ajax_get_queue_stats'));
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __('Realtime Sync', 'wc-realtime-sync'),
            __('Realtime Sync', 'wc-realtime-sync'),
            'manage_woocommerce',
            'wc-realtime-sync',
            array($this, 'admin_page')
        );
    }

    /**
     * Admin initialization
     */
    public function admin_init() {
        // Register settings
        register_setting(
            'wc_realtime_sync_settings',
            'wc_realtime_sync_options',
            array($this, 'sanitize_options')
        );
    }

    /**
     * Enqueue admin scripts
     */
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'woocommerce_page_wc-realtime-sync') {
            return;
        }

        wp_enqueue_script(
            'wc-realtime-sync-admin',
            WC_REALTIME_SYNC_PLUGIN_URL . 'admin/assets/admin.js',
            array('jquery', 'wp-util'),
            WC_REALTIME_SYNC_VERSION,
            true
        );

        wp_enqueue_style(
            'wc-realtime-sync-admin',
            WC_REALTIME_SYNC_PLUGIN_URL . 'admin/assets/admin.css',
            array(),
            WC_REALTIME_SYNC_VERSION
        );

        wp_localize_script('wc-realtime-sync-admin', 'wcRealtimeSync', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('wc_realtime_sync_admin'),
            'strings' => array(
                'testing' => __('Testing...', 'wc-realtime-sync'),
                'testSuccess' => __('Webhook test successful!', 'wc-realtime-sync'),
                'testFailed' => __('Webhook test failed:', 'wc-realtime-sync'),
                'retrying' => __('Retrying...', 'wc-realtime-sync'),
                'retrySuccess' => __('Webhook retry successful!', 'wc-realtime-sync'),
                'retryFailed' => __('Webhook retry failed:', 'wc-realtime-sync'),
                'confirmClear' => __('Are you sure you want to clear the queue?', 'wc-realtime-sync'),
                'clearing' => __('Clearing...', 'wc-realtime-sync'),
                'clearSuccess' => __('Queue cleared successfully!', 'wc-realtime-sync'),
                'clearFailed' => __('Failed to clear queue:', 'wc-realtime-sync'),
            ),
        ));
    }

    /**
     * Admin page
     */
    public function admin_page() {
        $active_tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'settings';

        ?>
        <div class="wrap">
            <h1><?php _e('WooCommerce Realtime Sync', 'wc-realtime-sync'); ?></h1>

            <nav class="nav-tab-wrapper">
                <a href="?page=wc-realtime-sync&tab=settings" 
                   class="nav-tab <?php echo $active_tab === 'settings' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Settings', 'wc-realtime-sync'); ?>
                </a>
                <a href="?page=wc-realtime-sync&tab=queue" 
                   class="nav-tab <?php echo $active_tab === 'queue' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Queue', 'wc-realtime-sync'); ?>
                </a>
                <a href="?page=wc-realtime-sync&tab=logs" 
                   class="nav-tab <?php echo $active_tab === 'logs' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Logs', 'wc-realtime-sync'); ?>
                </a>
                <a href="?page=wc-realtime-sync&tab=status" 
                   class="nav-tab <?php echo $active_tab === 'status' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Status', 'wc-realtime-sync'); ?>
                </a>
            </nav>

            <div class="tab-content">
                <?php
                switch ($active_tab) {
                    case 'queue':
                        $this->render_queue_tab();
                        break;
                    case 'logs':
                        $this->render_logs_tab();
                        break;
                    case 'status':
                        $this->render_status_tab();
                        break;
                    case 'settings':
                    default:
                        $this->render_settings_tab();
                        break;
                }
                ?>
            </div>
        </div>
        <?php
    }

    /**
     * Render settings tab
     */
    private function render_settings_tab() {
        ?>
        <form method="post" action="options.php">
            <?php
            settings_fields('wc_realtime_sync_settings');
            ?>

            <table class="form-table">
                <tr>
                    <th scope="row"><?php _e('Enable Webhook Sync', 'wc-realtime-sync'); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="wc_realtime_sync_options[enabled]" value="1" 
                                   <?php checked(!empty($this->options['enabled'])); ?> />
                            <?php _e('Enable real-time webhook synchronization', 'wc-realtime-sync'); ?>
                        </label>
                        <p class="description">
                            <?php _e('When enabled, webhooks will be sent for configured events.', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Webhook Endpoint', 'wc-realtime-sync'); ?></th>
                    <td>
                        <input type="url" name="wc_realtime_sync_options[webhook_endpoint]" 
                               value="<?php echo esc_attr($this->options['webhook_endpoint'] ?? ''); ?>" 
                               class="regular-text" placeholder="https://your-site.com/api/webhook" />
                        <button type="button" id="test-webhook" class="button">
                            <?php _e('Test Webhook', 'wc-realtime-sync'); ?>
                        </button>
                        <p class="description">
                            <?php _e('The URL where webhook notifications will be sent. HTTPS is required for production.', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Secret Key', 'wc-realtime-sync'); ?></th>
                    <td>
                        <input type="text" name="wc_realtime_sync_options[secret_key]" 
                               value="<?php echo esc_attr($this->options['secret_key'] ?? ''); ?>" 
                               class="regular-text" />
                        <button type="button" id="generate-secret" class="button">
                            <?php _e('Generate New', 'wc-realtime-sync'); ?>
                        </button>
                        <p class="description">
                            <?php _e('Secret key for webhook signature verification. Keep this secure and synchronized with your endpoint.', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Events', 'wc-realtime-sync'); ?></th>
                    <td>
                        <fieldset>
                            <legend class="screen-reader-text"><?php _e('Select events to trigger webhooks', 'wc-realtime-sync'); ?></legend>
                            
                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][order_created]" value="1" 
                                       <?php checked(!empty($this->options['events']['order_created'])); ?> />
                                <?php _e('Order Created', 'wc-realtime-sync'); ?>
                            </label><br>

                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][order_updated]" value="1" 
                                       <?php checked(!empty($this->options['events']['order_updated'])); ?> />
                                <?php _e('Order Updated', 'wc-realtime-sync'); ?>
                            </label><br>

                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][order_deleted]" value="1" 
                                       <?php checked(!empty($this->options['events']['order_deleted'])); ?> />
                                <?php _e('Order Deleted', 'wc-realtime-sync'); ?>
                            </label><br>

                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][product_created]" value="1" 
                                       <?php checked(!empty($this->options['events']['product_created'])); ?> />
                                <?php _e('Product Created', 'wc-realtime-sync'); ?>
                            </label><br>

                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][product_updated]" value="1" 
                                       <?php checked(!empty($this->options['events']['product_updated'])); ?> />
                                <?php _e('Product Updated', 'wc-realtime-sync'); ?>
                            </label><br>

                            <label>
                                <input type="checkbox" name="wc_realtime_sync_options[events][product_deleted]" value="1" 
                                       <?php checked(!empty($this->options['events']['product_deleted'])); ?> />
                                <?php _e('Product Deleted', 'wc-realtime-sync'); ?>
                            </label>
                        </fieldset>
                        <p class="description">
                            <?php _e('Select which events should trigger webhook notifications.', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Retry Attempts', 'wc-realtime-sync'); ?></th>
                    <td>
                        <input type="number" name="wc_realtime_sync_options[retry_attempts]" 
                               value="<?php echo esc_attr($this->options['retry_attempts'] ?? 3); ?>" 
                               min="1" max="10" />
                        <p class="description">
                            <?php _e('Number of times to retry failed webhook deliveries (1-10).', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Timeout', 'wc-realtime-sync'); ?></th>
                    <td>
                        <input type="number" name="wc_realtime_sync_options[timeout]" 
                               value="<?php echo esc_attr($this->options['timeout'] ?? 30); ?>" 
                               min="5" max="120" />
                        <span><?php _e('seconds', 'wc-realtime-sync'); ?></span>
                        <p class="description">
                            <?php _e('HTTP timeout for webhook requests (5-120 seconds).', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Batch Size', 'wc-realtime-sync'); ?></th>
                    <td>
                        <input type="number" name="wc_realtime_sync_options[batch_size]" 
                               value="<?php echo esc_attr($this->options['batch_size'] ?? 10); ?>" 
                               min="1" max="50" />
                        <p class="description">
                            <?php _e('Number of webhooks to process in each batch (1-50).', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><?php _e('Debug Mode', 'wc-realtime-sync'); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="wc_realtime_sync_options[debug_mode]" value="1" 
                                   <?php checked(!empty($this->options['debug_mode'])); ?> />
                            <?php _e('Enable debug logging', 'wc-realtime-sync'); ?>
                        </label>
                        <p class="description">
                            <?php _e('Log detailed information to PHP error log for troubleshooting.', 'wc-realtime-sync'); ?>
                        </p>
                    </td>
                </tr>
            </table>

            <?php submit_button(); ?>
        </form>

        <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#generate-secret').on('click', function() {
                var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                var secret = '';
                for (var i = 0; i < 32; i++) {
                    secret += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                $('input[name="wc_realtime_sync_options[secret_key]"]').val(secret);
            });

            $('#test-webhook').on('click', function() {
                var $button = $(this);
                var endpoint = $('input[name="wc_realtime_sync_options[webhook_endpoint]"]').val();
                var secretKey = $('input[name="wc_realtime_sync_options[secret_key]"]').val();

                if (!endpoint) {
                    alert('<?php _e('Please enter a webhook endpoint first.', 'wc-realtime-sync'); ?>');
                    return;
                }

                $button.prop('disabled', true).text(wcRealtimeSync.strings.testing);

                $.post(wcRealtimeSync.ajaxUrl, {
                    action: 'wc_realtime_sync_test_webhook',
                    nonce: wcRealtimeSync.nonce,
                    endpoint: endpoint,
                    secret_key: secretKey
                }).done(function(response) {
                    if (response.success) {
                        alert(wcRealtimeSync.strings.testSuccess + '\n' + 
                              'Status: ' + response.data.http_status + '\n' +
                              'Response Time: ' + Math.round(response.data.execution_time * 1000) + 'ms');
                    } else {
                        alert(wcRealtimeSync.strings.testFailed + ' ' + response.data);
                    }
                }).fail(function() {
                    alert(wcRealtimeSync.strings.testFailed + ' Network error');
                }).always(function() {
                    $button.prop('disabled', false).text('<?php _e('Test Webhook', 'wc-realtime-sync'); ?>');
                });
            });
        });
        </script>
        <?php
    }

    /**
     * Render queue tab
     */
    private function render_queue_tab() {
        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $stats = $queue_manager->get_queue_stats();
        
        $status_filter = isset($_GET['status']) ? sanitize_text_field($_GET['status']) : '';
        $paged = isset($_GET['paged']) ? absint($_GET['paged']) : 1;
        $per_page = 20;

        $queue_data = $queue_manager->get_queue_items(array(
            'status' => $status_filter,
            'limit' => $per_page,
            'offset' => ($paged - 1) * $per_page,
        ));

        ?>
        <div class="wc-realtime-sync-queue">
            <div class="queue-stats">
                <div class="stats-cards">
                    <div class="stat-card">
                        <h3><?php _e('Pending', 'wc-realtime-sync'); ?></h3>
                        <span class="stat-number"><?php echo $stats['pending'] ?? 0; ?></span>
                    </div>
                    <div class="stat-card">
                        <h3><?php _e('Processing', 'wc-realtime-sync'); ?></h3>
                        <span class="stat-number"><?php echo $stats['processing'] ?? 0; ?></span>
                    </div>
                    <div class="stat-card">
                        <h3><?php _e('Completed', 'wc-realtime-sync'); ?></h3>
                        <span class="stat-number"><?php echo $stats['completed'] ?? 0; ?></span>
                    </div>
                    <div class="stat-card">
                        <h3><?php _e('Failed', 'wc-realtime-sync'); ?></h3>
                        <span class="stat-number"><?php echo $stats['failed'] ?? 0; ?></span>
                    </div>
                </div>

                <div class="queue-actions">
                    <button type="button" id="refresh-queue" class="button">
                        <?php _e('Refresh', 'wc-realtime-sync'); ?>
                    </button>
                    <button type="button" id="retry-failed" class="button">
                        <?php _e('Retry Failed', 'wc-realtime-sync'); ?>
                    </button>
                    <button type="button" id="clear-completed" class="button">
                        <?php _e('Clear Completed', 'wc-realtime-sync'); ?>
                    </button>
                </div>
            </div>

            <div class="tablenav top">
                <div class="alignleft actions">
                    <select id="queue-status-filter">
                        <option value=""><?php _e('All statuses', 'wc-realtime-sync'); ?></option>
                        <option value="pending" <?php selected($status_filter, 'pending'); ?>><?php _e('Pending', 'wc-realtime-sync'); ?></option>
                        <option value="processing" <?php selected($status_filter, 'processing'); ?>><?php _e('Processing', 'wc-realtime-sync'); ?></option>
                        <option value="completed" <?php selected($status_filter, 'completed'); ?>><?php _e('Completed', 'wc-realtime-sync'); ?></option>
                        <option value="failed" <?php selected($status_filter, 'failed'); ?>><?php _e('Failed', 'wc-realtime-sync'); ?></option>
                    </select>
                    <button type="button" id="filter-queue" class="button"><?php _e('Filter', 'wc-realtime-sync'); ?></button>
                </div>
            </div>

            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('ID', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Event', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Object', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Status', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Attempts', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Created', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Actions', 'wc-realtime-sync'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!empty($queue_data['items'])) : ?>
                        <?php foreach ($queue_data['items'] as $item) : ?>
                            <tr>
                                <td><?php echo esc_html($item->id); ?></td>
                                <td><?php echo esc_html($item->event_type); ?></td>
                                <td><?php echo esc_html($item->object_type . ' #' . $item->object_id); ?></td>
                                <td>
                                    <span class="status-<?php echo esc_attr($item->status); ?>">
                                        <?php echo esc_html(ucfirst($item->status)); ?>
                                    </span>
                                </td>
                                <td><?php echo esc_html($item->attempts . '/' . $item->max_attempts); ?></td>
                                <td><?php echo esc_html(mysql2date('Y-m-d H:i:s', $item->created_at)); ?></td>
                                <td>
                                    <?php if ($item->status === 'failed') : ?>
                                        <button type="button" class="button-small retry-webhook" data-id="<?php echo esc_attr($item->id); ?>">
                                            <?php _e('Retry', 'wc-realtime-sync'); ?>
                                        </button>
                                    <?php endif; ?>
                                    <button type="button" class="button-small delete-webhook" data-id="<?php echo esc_attr($item->id); ?>">
                                        <?php _e('Delete', 'wc-realtime-sync'); ?>
                                    </button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else : ?>
                        <tr>
                            <td colspan="7"><?php _e('No items found.', 'wc-realtime-sync'); ?></td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>

            <?php
            // Pagination
            if ($queue_data['total'] > $per_page) {
                $total_pages = ceil($queue_data['total'] / $per_page);
                echo '<div class="tablenav bottom">';
                echo paginate_links(array(
                    'base' => add_query_arg('paged', '%#%'),
                    'format' => '',
                    'prev_text' => '&laquo;',
                    'next_text' => '&raquo;',
                    'current' => $paged,
                    'total' => $total_pages,
                ));
                echo '</div>';
            }
            ?>
        </div>
        <?php
    }

    /**
     * Render logs tab
     */
    private function render_logs_tab() {
        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $log_stats = $queue_manager->get_log_stats(7);
        
        $event_filter = isset($_GET['event_type']) ? sanitize_text_field($_GET['event_type']) : '';
        $paged = isset($_GET['paged']) ? absint($_GET['paged']) : 1;
        $per_page = 50;

        $logs_data = $queue_manager->get_webhook_logs(array(
            'event_type' => $event_filter,
            'limit' => $per_page,
            'offset' => ($paged - 1) * $per_page,
        ));

        ?>
        <div class="wc-realtime-sync-logs">
            <div class="log-stats">
                <h3><?php _e('Statistics (Last 7 days)', 'wc-realtime-sync'); ?></h3>
                <p><?php printf(__('Success Rate: %s%% (%d/%d attempts)', 'wc-realtime-sync'), 
                    $log_stats['success_rate'], 
                    $log_stats['successful_attempts'], 
                    $log_stats['total_attempts']); ?></p>
                <p><?php printf(__('Average Response Time: %s seconds', 'wc-realtime-sync'), $log_stats['avg_response_time']); ?></p>
            </div>

            <div class="tablenav top">
                <div class="alignleft actions">
                    <select id="log-event-filter">
                        <option value=""><?php _e('All events', 'wc-realtime-sync'); ?></option>
                        <?php if (!empty($log_stats['event_activity'])) : ?>
                            <?php foreach ($log_stats['event_activity'] as $activity) : ?>
                                <option value="<?php echo esc_attr($activity->event_type); ?>" <?php selected($event_filter, $activity->event_type); ?>>
                                    <?php echo esc_html($activity->event_type . ' (' . $activity->count . ')'); ?>
                                </option>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                    <button type="button" id="filter-logs" class="button"><?php _e('Filter', 'wc-realtime-sync'); ?></button>
                </div>

                <div class="alignright actions">
                    <button type="button" id="clear-old-logs" class="button">
                        <?php _e('Clear Old Logs', 'wc-realtime-sync'); ?>
                    </button>
                </div>
            </div>

            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Event', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Object', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('HTTP Status', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Response Time', 'wc-realtime-sync'); ?></th>
                        <th><?php _e('Timestamp', 'wc-realtime-sync'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!empty($logs_data['logs'])) : ?>
                        <?php foreach ($logs_data['logs'] as $log) : ?>
                            <tr>
                                <td><?php echo esc_html($log->event_type); ?></td>
                                <td><?php echo esc_html($log->object_type . ' #' . $log->object_id); ?></td>
                                <td>
                                    <span class="http-status status-<?php echo $log->http_status >= 200 && $log->http_status < 300 ? 'success' : 'error'; ?>">
                                        <?php echo esc_html($log->http_status); ?>
                                    </span>
                                </td>
                                <td><?php echo esc_html($log->execution_time ? round($log->execution_time, 3) . 's' : '-'); ?></td>
                                <td><?php echo esc_html(mysql2date('Y-m-d H:i:s', $log->created_at)); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else : ?>
                        <tr>
                            <td colspan="5"><?php _e('No logs found.', 'wc-realtime-sync'); ?></td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>

            <?php
            // Pagination for logs
            if ($logs_data['total'] > $per_page) {
                $total_pages = ceil($logs_data['total'] / $per_page);
                echo '<div class="tablenav bottom">';
                echo paginate_links(array(
                    'base' => add_query_arg('paged', '%#%'),
                    'format' => '',
                    'prev_text' => '&laquo;',
                    'next_text' => '&raquo;',
                    'current' => $paged,
                    'total' => $total_pages,
                ));
                echo '</div>';
            }
            ?>
        </div>
        <?php
    }

    /**
     * Render status tab
     */
    private function render_status_tab() {
        $options = $this->options;
        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $stats = $queue_manager->get_queue_stats();

        ?>
        <div class="wc-realtime-sync-status">
            <h3><?php _e('System Status', 'wc-realtime-sync'); ?></h3>
            
            <table class="widefat">
                <tbody>
                    <tr>
                        <td><strong><?php _e('Plugin Status', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php if (!empty($options['enabled'])) : ?>
                                <span class="status-enabled"><?php _e('Enabled', 'wc-realtime-sync'); ?></span>
                            <?php else : ?>
                                <span class="status-disabled"><?php _e('Disabled', 'wc-realtime-sync'); ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Webhook Endpoint', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php if (!empty($options['webhook_endpoint'])) : ?>
                                <code><?php echo esc_html($options['webhook_endpoint']); ?></code>
                            <?php else : ?>
                                <em><?php _e('Not configured', 'wc-realtime-sync'); ?></em>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Secret Key', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php if (!empty($options['secret_key'])) : ?>
                                <span class="status-enabled"><?php _e('Configured', 'wc-realtime-sync'); ?></span>
                            <?php else : ?>
                                <span class="status-disabled"><?php _e('Not configured', 'wc-realtime-sync'); ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Active Events', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php
                            $active_events = array_filter($options['events'] ?? array());
                            if (!empty($active_events)) {
                                echo esc_html(implode(', ', array_keys($active_events)));
                            } else {
                                echo '<em>' . __('None', 'wc-realtime-sync') . '</em>';
                            }
                            ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Queue Status', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php
                            $total_queue = array_sum($stats);
                            if ($total_queue > 0) {
                                printf(__('%d items (%d pending, %d failed)', 'wc-realtime-sync'),
                                    $total_queue,
                                    $stats['pending'] ?? 0,
                                    $stats['failed'] ?? 0
                                );
                            } else {
                                _e('Empty', 'wc-realtime-sync');
                            }
                            ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('WordPress Cron', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php
                            $cron_enabled = !defined('DISABLE_WP_CRON') || !DISABLE_WP_CRON;
                            if ($cron_enabled) {
                                echo '<span class="status-enabled">' . __('Enabled', 'wc-realtime-sync') . '</span>';
                            } else {
                                echo '<span class="status-disabled">' . __('Disabled', 'wc-realtime-sync') . '</span>';
                                echo '<br><em>' . __('WordPress cron is disabled. Queue processing may not work automatically.', 'wc-realtime-sync') . '</em>';
                            }
                            ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Next Scheduled Run', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php
                            $next_run = wp_next_scheduled('wc_realtime_sync_process_queue');
                            if ($next_run) {
                                echo esc_html(date_i18n('Y-m-d H:i:s', $next_run));
                            } else {
                                echo '<em>' . __('Not scheduled', 'wc-realtime-sync') . '</em>';
                            }
                            ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Debug Mode', 'wc-realtime-sync'); ?></strong></td>
                        <td>
                            <?php if (!empty($options['debug_mode'])) : ?>
                                <span class="status-enabled"><?php _e('Enabled', 'wc-realtime-sync'); ?></span>
                            <?php else : ?>
                                <span class="status-disabled"><?php _e('Disabled', 'wc-realtime-sync'); ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>

            <h3><?php _e('System Information', 'wc-realtime-sync'); ?></h3>
            
            <table class="widefat">
                <tbody>
                    <tr>
                        <td><strong><?php _e('Plugin Version', 'wc-realtime-sync'); ?></strong></td>
                        <td><?php echo esc_html(WC_REALTIME_SYNC_VERSION); ?></td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('WordPress Version', 'wc-realtime-sync'); ?></strong></td>
                        <td><?php echo esc_html(get_bloginfo('version')); ?></td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('WooCommerce Version', 'wc-realtime-sync'); ?></strong></td>
                        <td><?php echo esc_html(WC_VERSION); ?></td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('PHP Version', 'wc-realtime-sync'); ?></strong></td>
                        <td><?php echo esc_html(PHP_VERSION); ?></td>
                    </tr>
                    <tr>
                        <td><strong><?php _e('Server Time', 'wc-realtime-sync'); ?></strong></td>
                        <td><?php echo esc_html(current_time('mysql')); ?></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <?php
    }

    /**
     * Sanitize options
     */
    public function sanitize_options($input) {
        $security = WC_Realtime_Sync_Security::get_instance();
        return $security->sanitize_settings($input);
    }

    /**
     * AJAX test webhook
     */
    public function ajax_test_webhook() {
        // Verify nonce and capabilities
        if (!wp_verify_nonce($_POST['nonce'], 'wc_realtime_sync_admin') || 
            !current_user_can('manage_woocommerce')) {
            wp_die(__('Unauthorized', 'wc-realtime-sync'));
        }

        $endpoint = sanitize_url($_POST['endpoint']);
        $secret_key = sanitize_text_field($_POST['secret_key']);

        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $result = $queue_manager->test_webhook_endpoint($endpoint, $secret_key);

        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result['error']);
        }
    }

    /**
     * AJAX retry webhook
     */
    public function ajax_retry_webhook() {
        // Verify nonce and capabilities
        if (!wp_verify_nonce($_POST['nonce'], 'wc_realtime_sync_admin') || 
            !current_user_can('manage_woocommerce')) {
            wp_die(__('Unauthorized', 'wc-realtime-sync'));
        }

        $webhook_id = absint($_POST['webhook_id']);

        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $result = $queue_manager->retry_webhook($webhook_id);

        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_message());
        } else {
            wp_send_json_success(__('Webhook queued for retry.', 'wc-realtime-sync'));
        }
    }

    /**
     * AJAX clear queue
     */
    public function ajax_clear_queue() {
        // Verify nonce and capabilities
        if (!wp_verify_nonce($_POST['nonce'], 'wc_realtime_sync_admin') || 
            !current_user_can('manage_woocommerce')) {
            wp_die(__('Unauthorized', 'wc-realtime-sync'));
        }

        $action = sanitize_text_field($_POST['clear_action']);
        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();

        switch ($action) {
            case 'completed':
                $result = $queue_manager->clear_completed();
                break;
            case 'failed':
                $result = $queue_manager->clear_failed();
                break;
            case 'logs':
                $result = $queue_manager->clear_old_logs();
                break;
            default:
                wp_send_json_error(__('Invalid action.', 'wc-realtime-sync'));
        }

        if ($result !== false) {
            wp_send_json_success(sprintf(__('%d items cleared.', 'wc-realtime-sync'), $result));
        } else {
            wp_send_json_error(__('Failed to clear items.', 'wc-realtime-sync'));
        }
    }

    /**
     * AJAX get queue stats
     */
    public function ajax_get_queue_stats() {
        // Verify nonce and capabilities
        if (!wp_verify_nonce($_POST['nonce'], 'wc_realtime_sync_admin') || 
            !current_user_can('manage_woocommerce')) {
            wp_die(__('Unauthorized', 'wc-realtime-sync'));
        }

        $queue_manager = WC_Realtime_Sync_Queue_Manager::get_instance();
        $stats = $queue_manager->get_queue_stats();

        wp_send_json_success($stats);
    }
}