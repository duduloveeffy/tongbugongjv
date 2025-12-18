'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StickyNote, Pencil, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WeekNoteProps {
  year: number;
  week: number;
  className?: string;
  onNoteChange?: (hasNote: boolean) => void;
}

export function WeekNote({ year, week, className, onNoteChange }: WeekNoteProps) {
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 从 API 加载备注
  useEffect(() => {
    const loadNote = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/week-notes?year=${year}&week=${week}`);
        const result = await response.json();
        if (result.success && result.data) {
          setNote(result.data.note);
          setEditingNote(result.data.note);
          onNoteChange?.(true);
        } else {
          setNote('');
          setEditingNote('');
          onNoteChange?.(false);
        }
      } catch (error) {
        console.error('Failed to load note:', error);
        setNote('');
        setEditingNote('');
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [year, week, onNoteChange]);

  // 保存备注
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/week-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, week, note: editingNote }),
      });
      const result = await response.json();

      if (result.success) {
        const newNote = editingNote.trim();
        setNote(newNote);
        setIsEditing(false);
        onNoteChange?.(newNote.length > 0);
        toast.success(newNote ? '备注已保存' : '备注已删除');
      } else {
        toast.error('保存失败: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑
  const handleCancel = () => {
    setEditingNote(note);
    setIsEditing(false);
  };

  // 开始编辑
  const handleStartEdit = () => {
    setEditingNote(note);
    setIsEditing(true);
  };

  // 打开 Popover 时的处理
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setIsEditing(false);
      setEditingNote(note);
    }
  };

  const hasNote = note.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={hasNote ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'gap-1.5',
            hasNote && 'bg-amber-500 hover:bg-amber-600 text-white',
            className
          )}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <StickyNote className="h-4 w-4" />
          )}
          {hasNote ? '查看备注' : '添加备注'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              {year}年第{week}周备注
            </div>
            {!isEditing && hasNote && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                className="h-7 px-2"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                编辑
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                placeholder="记录本周重要事项，如：开始做活动、调整价格..."
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                className="min-h-[100px] resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="h-8"
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSave} className="h-8" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  )}
                  保存
                </Button>
              </div>
            </div>
          ) : hasNote ? (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
              {note}
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="记录本周重要事项，如：开始做活动、调整价格..."
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                className="min-h-[100px] resize-none"
                autoFocus
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!editingNote.trim() || saving}
                  className="h-8"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  )}
                  保存
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground border-t pt-2">
            备注保存到云端数据库
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
