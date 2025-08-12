<?php
/**
 * Data Formatter Class
 * 
 * Formats WooCommerce data for webhook payloads
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Realtime_Sync_Data_Formatter {

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
     * Format order data for webhook
     */
    public function format_order_data($order_id, $event_type) {
        $order = wc_get_order($order_id);
        
        if (!$order) {
            return null;
        }

        // Base order data
        $data = array(
            'event' => $event_type,
            'timestamp' => current_time('timestamp'),
            'site_url' => home_url(),
            'order' => array(
                'id' => $order->get_id(),
                'number' => $order->get_order_number(),
                'order_key' => $order->get_order_key(),
                'status' => $order->get_status(),
                'currency' => $order->get_currency(),
                'date_created' => $order->get_date_created() ? $order->get_date_created()->format('c') : null,
                'date_modified' => $order->get_date_modified() ? $order->get_date_modified()->format('c') : null,
                'date_completed' => $order->get_date_completed() ? $order->get_date_completed()->format('c') : null,
                'date_paid' => $order->get_date_paid() ? $order->get_date_paid()->format('c') : null,
                
                // Pricing
                'total' => $order->get_total(),
                'subtotal' => $order->get_subtotal(),
                'total_tax' => $order->get_total_tax(),
                'shipping_total' => $order->get_shipping_total(),
                'shipping_tax' => $order->get_shipping_tax(),
                'discount_total' => $order->get_discount_total(),
                'discount_tax' => $order->get_discount_tax(),
                
                // Payment
                'payment_method' => $order->get_payment_method(),
                'payment_method_title' => $order->get_payment_method_title(),
                'transaction_id' => $order->get_transaction_id(),
                
                // Customer
                'customer_id' => $order->get_customer_id(),
                'customer_note' => $order->get_customer_note(),
                
                // Billing
                'billing' => array(
                    'first_name' => $order->get_billing_first_name(),
                    'last_name' => $order->get_billing_last_name(),
                    'company' => $order->get_billing_company(),
                    'address_1' => $order->get_billing_address_1(),
                    'address_2' => $order->get_billing_address_2(),
                    'city' => $order->get_billing_city(),
                    'state' => $order->get_billing_state(),
                    'postcode' => $order->get_billing_postcode(),
                    'country' => $order->get_billing_country(),
                    'email' => $order->get_billing_email(),
                    'phone' => $order->get_billing_phone(),
                ),
                
                // Shipping
                'shipping' => array(
                    'first_name' => $order->get_shipping_first_name(),
                    'last_name' => $order->get_shipping_last_name(),
                    'company' => $order->get_shipping_company(),
                    'address_1' => $order->get_shipping_address_1(),
                    'address_2' => $order->get_shipping_address_2(),
                    'city' => $order->get_shipping_city(),
                    'state' => $order->get_shipping_state(),
                    'postcode' => $order->get_shipping_postcode(),
                    'country' => $order->get_shipping_country(),
                ),
                
                // Line items
                'line_items' => $this->format_order_line_items($order),
                
                // Shipping lines
                'shipping_lines' => $this->format_order_shipping_lines($order),
                
                // Tax lines
                'tax_lines' => $this->format_order_tax_lines($order),
                
                // Fee lines
                'fee_lines' => $this->format_order_fee_lines($order),
                
                // Coupon lines
                'coupon_lines' => $this->format_order_coupon_lines($order),
                
                // Refunds
                'refunds' => $this->format_order_refunds($order),
                
                // Meta data (filtered)
                'meta_data' => $this->format_meta_data($order->get_meta_data()),
            )
        );

        return apply_filters('wc_realtime_sync_order_data', $data, $order, $event_type);
    }

    /**
     * Format product data for webhook
     */
    public function format_product_data($product_id, $event_type) {
        $product = wc_get_product($product_id);
        
        if (!$product) {
            return null;
        }

        // Base product data
        $data = array(
            'event' => $event_type,
            'timestamp' => current_time('timestamp'),
            'site_url' => home_url(),
            'product' => array(
                'id' => $product->get_id(),
                'name' => $product->get_name(),
                'slug' => $product->get_slug(),
                'permalink' => get_permalink($product->get_id()),
                'type' => $product->get_type(),
                'status' => $product->get_status(),
                'featured' => $product->get_featured(),
                'catalog_visibility' => $product->get_catalog_visibility(),
                
                'date_created' => $product->get_date_created() ? $product->get_date_created()->format('c') : null,
                'date_modified' => $product->get_date_modified() ? $product->get_date_modified()->format('c') : null,
                'date_on_sale_from' => $product->get_date_on_sale_from() ? $product->get_date_on_sale_from()->format('c') : null,
                'date_on_sale_to' => $product->get_date_on_sale_to() ? $product->get_date_on_sale_to()->format('c') : null,
                
                // Description
                'description' => $product->get_description(),
                'short_description' => $product->get_short_description(),
                
                // SKU
                'sku' => $product->get_sku(),
                
                // Pricing
                'price' => $product->get_price(),
                'regular_price' => $product->get_regular_price(),
                'sale_price' => $product->get_sale_price(),
                
                // Tax
                'tax_status' => $product->get_tax_status(),
                'tax_class' => $product->get_tax_class(),
                
                // Inventory
                'manage_stock' => $product->get_manage_stock(),
                'stock_quantity' => $product->get_stock_quantity(),
                'stock_status' => $product->get_stock_status(),
                'backorders' => $product->get_backorders(),
                'low_stock_amount' => $product->get_low_stock_amount(),
                'sold_individually' => $product->get_sold_individually(),
                
                // Shipping
                'weight' => $product->get_weight(),
                'dimensions' => array(
                    'length' => $product->get_length(),
                    'width' => $product->get_width(),
                    'height' => $product->get_height(),
                ),
                'shipping_class' => $product->get_shipping_class(),
                
                // Linked products
                'upsell_ids' => $product->get_upsell_ids(),
                'cross_sell_ids' => $product->get_cross_sell_ids(),
                'parent_id' => $product->get_parent_id(),
                
                // Categories
                'categories' => $this->format_product_categories($product),
                
                // Tags
                'tags' => $this->format_product_tags($product),
                
                // Images
                'images' => $this->format_product_images($product),
                
                // Attributes
                'attributes' => $this->format_product_attributes($product),
                
                // Variations (for variable products)
                'variations' => $this->format_product_variations($product),
                
                // Downloads
                'downloadable' => $product->get_downloadable(),
                'downloads' => $this->format_product_downloads($product),
                'download_limit' => $product->get_download_limit(),
                'download_expiry' => $product->get_download_expiry(),
                
                // External
                'external_url' => method_exists($product, 'get_product_url') ? $product->get_product_url() : '',
                'button_text' => method_exists($product, 'get_button_text') ? $product->get_button_text() : '',
                
                // Reviews
                'reviews_allowed' => $product->get_reviews_allowed(),
                'average_rating' => $product->get_average_rating(),
                'rating_count' => $product->get_rating_count(),
                
                // Meta data (filtered)
                'meta_data' => $this->format_meta_data($product->get_meta_data()),
            )
        );

        // Add variation-specific data if this is a variation
        if ($product->is_type('variation')) {
            $data['product']['variation_attributes'] = $product->get_variation_attributes();
        }

        return apply_filters('wc_realtime_sync_product_data', $data, $product, $event_type);
    }

    /**
     * Format order line items
     */
    private function format_order_line_items($order) {
        $line_items = array();
        
        foreach ($order->get_items() as $item_id => $item) {
            $line_items[] = array(
                'id' => $item_id,
                'name' => $item->get_name(),
                'product_id' => $item->get_product_id(),
                'variation_id' => $item->get_variation_id(),
                'quantity' => $item->get_quantity(),
                'tax_class' => $item->get_tax_class(),
                'subtotal' => $item->get_subtotal(),
                'subtotal_tax' => $item->get_subtotal_tax(),
                'total' => $item->get_total(),
                'total_tax' => $item->get_total_tax(),
                'taxes' => $item->get_taxes(),
                'meta_data' => $this->format_meta_data($item->get_meta_data()),
                'sku' => $item->get_product() ? $item->get_product()->get_sku() : '',
                'price' => $order->get_item_total($item, false, false),
            );
        }
        
        return $line_items;
    }

    /**
     * Format order shipping lines
     */
    private function format_order_shipping_lines($order) {
        $shipping_lines = array();
        
        foreach ($order->get_items('shipping') as $item_id => $item) {
            $shipping_lines[] = array(
                'id' => $item_id,
                'method_title' => $item->get_method_title(),
                'method_id' => $item->get_method_id(),
                'instance_id' => $item->get_instance_id(),
                'total' => $item->get_total(),
                'total_tax' => $item->get_total_tax(),
                'taxes' => $item->get_taxes(),
                'meta_data' => $this->format_meta_data($item->get_meta_data()),
            );
        }
        
        return $shipping_lines;
    }

    /**
     * Format order tax lines
     */
    private function format_order_tax_lines($order) {
        $tax_lines = array();
        
        foreach ($order->get_items('tax') as $item_id => $item) {
            $tax_lines[] = array(
                'id' => $item_id,
                'rate_code' => $item->get_rate_code(),
                'rate_id' => $item->get_rate_id(),
                'label' => $item->get_label(),
                'compound' => $item->get_compound(),
                'tax_total' => $item->get_tax_total(),
                'shipping_tax_total' => $item->get_shipping_tax_total(),
                'rate_percent' => $item->get_rate_percent(),
                'meta_data' => $this->format_meta_data($item->get_meta_data()),
            );
        }
        
        return $tax_lines;
    }

    /**
     * Format order fee lines
     */
    private function format_order_fee_lines($order) {
        $fee_lines = array();
        
        foreach ($order->get_items('fee') as $item_id => $item) {
            $fee_lines[] = array(
                'id' => $item_id,
                'name' => $item->get_name(),
                'tax_class' => $item->get_tax_class(),
                'tax_status' => $item->get_tax_status(),
                'amount' => $item->get_amount(),
                'total' => $item->get_total(),
                'total_tax' => $item->get_total_tax(),
                'taxes' => $item->get_taxes(),
                'meta_data' => $this->format_meta_data($item->get_meta_data()),
            );
        }
        
        return $fee_lines;
    }

    /**
     * Format order coupon lines
     */
    private function format_order_coupon_lines($order) {
        $coupon_lines = array();
        
        foreach ($order->get_items('coupon') as $item_id => $item) {
            $coupon_lines[] = array(
                'id' => $item_id,
                'code' => $item->get_code(),
                'discount' => $item->get_discount(),
                'discount_tax' => $item->get_discount_tax(),
                'meta_data' => $this->format_meta_data($item->get_meta_data()),
            );
        }
        
        return $coupon_lines;
    }

    /**
     * Format order refunds
     */
    private function format_order_refunds($order) {
        $refunds = array();
        
        foreach ($order->get_refunds() as $refund) {
            $refunds[] = array(
                'id' => $refund->get_id(),
                'date_created' => $refund->get_date_created() ? $refund->get_date_created()->format('c') : null,
                'amount' => $refund->get_amount(),
                'reason' => $refund->get_reason(),
                'refunded_by' => $refund->get_refunded_by(),
            );
        }
        
        return $refunds;
    }

    /**
     * Format product categories
     */
    private function format_product_categories($product) {
        $categories = array();
        $terms = get_the_terms($product->get_id(), 'product_cat');
        
        if ($terms && !is_wp_error($terms)) {
            foreach ($terms as $term) {
                $categories[] = array(
                    'id' => $term->term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                );
            }
        }
        
        return $categories;
    }

    /**
     * Format product tags
     */
    private function format_product_tags($product) {
        $tags = array();
        $terms = get_the_terms($product->get_id(), 'product_tag');
        
        if ($terms && !is_wp_error($terms)) {
            foreach ($terms as $term) {
                $tags[] = array(
                    'id' => $term->term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                );
            }
        }
        
        return $tags;
    }

    /**
     * Format product images
     */
    private function format_product_images($product) {
        $images = array();
        $attachment_ids = $product->get_gallery_image_ids();
        
        // Add main image
        if ($product->get_image_id()) {
            array_unshift($attachment_ids, $product->get_image_id());
        }
        
        foreach ($attachment_ids as $attachment_id) {
            $attachment_post = get_post($attachment_id);
            if ($attachment_post) {
                $images[] = array(
                    'id' => $attachment_id,
                    'date_created' => $attachment_post->post_date_gmt,
                    'date_modified' => $attachment_post->post_modified_gmt,
                    'src' => wp_get_attachment_url($attachment_id),
                    'name' => get_the_title($attachment_id),
                    'alt' => get_post_meta($attachment_id, '_wp_attachment_image_alt', true),
                );
            }
        }
        
        return $images;
    }

    /**
     * Format product attributes
     */
    private function format_product_attributes($product) {
        $attributes = array();
        
        foreach ($product->get_attributes() as $attribute) {
            $attributes[] = array(
                'id' => $attribute->get_id(),
                'name' => $attribute->get_name(),
                'options' => $attribute->get_options(),
                'position' => $attribute->get_position(),
                'visible' => $attribute->get_visible(),
                'variation' => $attribute->get_variation(),
            );
        }
        
        return $attributes;
    }

    /**
     * Format product variations
     */
    private function format_product_variations($product) {
        $variations = array();
        
        if ($product->is_type('variable')) {
            $variation_ids = $product->get_children();
            foreach ($variation_ids as $variation_id) {
                $variations[] = $variation_id;
            }
        }
        
        return $variations;
    }

    /**
     * Format product downloads
     */
    private function format_product_downloads($product) {
        $downloads = array();
        
        foreach ($product->get_downloads() as $key => $download) {
            $downloads[] = array(
                'id' => $key,
                'name' => $download->get_name(),
                'file' => $download->get_file(),
            );
        }
        
        return $downloads;
    }

    /**
     * Format meta data (filter sensitive data)
     */
    private function format_meta_data($meta_data) {
        $formatted = array();
        $excluded_keys = apply_filters('wc_realtime_sync_excluded_meta_keys', array(
            '_wp_old_slug',
            '_edit_lock',
            '_edit_last',
            '_wp_old_date',
            '_wp_trash_meta_status',
            '_wp_trash_meta_time',
        ));
        
        foreach ($meta_data as $meta) {
            $key = $meta->get_data()['key'];
            if (!in_array($key, $excluded_keys) && strpos($key, '_transient') !== 0) {
                $formatted[] = array(
                    'id' => $meta->get_data()['id'],
                    'key' => $key,
                    'value' => $meta->get_data()['value'],
                );
            }
        }
        
        return $formatted;
    }
}