import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface WooCommerceSettings {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

interface WooCommerceSettingsProps {
  settings: WooCommerceSettings;
  onSave: (settings: WooCommerceSettings) => void;
}

export function WooCommerceSettings({ settings, onSave }: WooCommerceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(settings);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSave = () => {
    if (!formData.siteUrl || !formData.consumerKey || !formData.consumerSecret) {
      toast.error('请填写完整的配置信息');
      return;
    }

    // 验证URL格式
    try {
      new URL(formData.siteUrl);
    } catch {
      toast.error('请输入有效的网站URL');
      return;
    }

    onSave(formData);
    setIsOpen(false);
    toast.success('WooCommerce配置已保存');
  };

  const handleReset = () => {
    setFormData(settings);
  };

  const isConfigured = settings.siteUrl && settings.consumerKey && settings.consumerSecret;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={isConfigured ? "outline" : "default"}>
          <Settings className="mr-2 h-4 w-4" />
          {isConfigured ? 'WooCommerce配置' : '配置WooCommerce'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>WooCommerce API配置</DialogTitle>
          <DialogDescription>
            配置WooCommerce API密钥以启用销量检测和库存同步功能
          </DialogDescription>
        </DialogHeader>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <Label htmlFor="site-url">网站URL</Label>
              <Input
                id="site-url"
                placeholder="https://your-site.com"
                value={formData.siteUrl}
                onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="consumer-key">Consumer Key</Label>
              <div className="relative">
                <Input
                  id="consumer-key"
                  type={showSecrets ? "text" : "password"}
                  placeholder="ck_..."
                  value={formData.consumerKey}
                  onChange={(e) => setFormData({ ...formData, consumerKey: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="consumer-secret">Consumer Secret</Label>
              <div className="relative">
                <Input
                  id="consumer-secret"
                  type={showSecrets ? "text" : "password"}
                  placeholder="cs_..."
                  value={formData.consumerSecret}
                  onChange={(e) => setFormData({ ...formData, consumerSecret: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">配置说明：</p>
              <ul className="space-y-1 text-xs">
                <li>• 在WooCommerce后台生成API密钥：WooCommerce → 设置 → 高级 → REST API</li>
                <li>• 权限设置为"读取/写入"</li>
                <li>• 网站URL应包含完整的域名，如：https://example.com</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                保存配置
              </Button>
              <Button onClick={handleReset} variant="outline">
                重置
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}