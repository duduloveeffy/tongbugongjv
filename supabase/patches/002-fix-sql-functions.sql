-- 修复数据库函数中的SQL语法错误
-- 主要问题：INTERVAL语法不正确

-- 修复get_webhook_stats函数
CREATE OR REPLACE FUNCTION get_webhook_stats(
  p_site_id UUID,
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_events BIGINT,
  successful_events BIGINT,
  failed_events BIGINT,
  avg_processing_time DECIMAL,
  success_rate DECIMAL,
  most_common_event TEXT,
  last_event_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH event_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as successful,
      COUNT(*) FILTER (WHERE status = 'error') as failed,
      AVG(processing_time_ms) as avg_time,
      MAX(received_at) as last_event
    FROM webhook_events
    WHERE site_id = p_site_id
      AND received_at >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
  ),
  common_event AS (
    SELECT event_type
    FROM webhook_events
    WHERE site_id = p_site_id
      AND received_at >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
    GROUP BY event_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT 
    es.total,
    es.successful,
    es.failed,
    ROUND(es.avg_time::decimal, 2),
    CASE WHEN es.total > 0 THEN ROUND((es.successful::decimal / es.total::decimal) * 100, 2) ELSE 0 END,
    COALESCE(ce.event_type, ''),
    es.last_event
  FROM event_stats es
  CROSS JOIN common_event ce;
END;
$$ LANGUAGE plpgsql;

-- 修复cleanup_webhook_logs函数
CREATE OR REPLACE FUNCTION cleanup_webhook_logs(
  p_days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete old webhook events
  DELETE FROM webhook_events
  WHERE received_at < CURRENT_DATE - (p_days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete old completed webhook queue items
  DELETE FROM webhook_queue
  WHERE status IN ('completed', 'failed')
    AND created_at < CURRENT_DATE - (p_days_to_keep || ' days')::INTERVAL;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;