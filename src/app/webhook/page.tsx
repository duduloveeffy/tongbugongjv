'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { WebhookManager } from '@/components/webhook/WebhookManager';

export default function WebhookPage() {
  return (
    <PageLayout
      title="Webhook 管理"
      description="配置和管理 Webhook 集成，实现自动化工作流"
    >
      <WebhookManager />
    </PageLayout>
  );
}