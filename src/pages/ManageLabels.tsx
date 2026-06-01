import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const labelColors = [
  '#6C63FF',
  '#ef4444',
  '#f97316',
  '#fb923c',
  '#f59e0b',
  '#fbbf24',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#34d399',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#60a5fa',
  '#3b82f6',
  '#8b5cf6',
  '#a78bfa',
  '#d946ef',
  '#ec4899',
  '#f472b6',
  '#64748b',
  '#94a3b8',
  '#78716c',
  '#6b7280',
];

export default function ManageLabels() {
  const navigate = useNavigate();
  const labels = useFinanceStore((s) => s.labels);
  const addLabel = useFinanceStore((s) => s.addLabel);
  const updateLabel = useFinanceStore((s) => s.updateLabel);
  const deleteLabel = useFinanceStore((s) => s.deleteLabel);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColors[0]);

  const handleEdit = (id: string) => {
    const label = labels.find((l) => l.id === id);
    if (!label) return;
    setEditId(id);
    setName(label.name);
    setColor(label.color);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editId) {
      updateLabel(editId, { name: name.trim(), color });
    } else {
      addLabel({ name: name.trim(), color });
    }
    resetForm();
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setName('');
    setColor(labelColors[0]);
  };

  return (
    <>
      {/* Header */}
      <Header>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Labels</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="text-primary h-9 w-9"
        >
          <Plus size={20} />
        </Button>
      </Header>

      <Main>
        {/* Form Dialog */}
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!v) resetForm();
          }}
        >
          <DialogContent className="bg-card top-1/4 mx-auto w-11/12 rounded-2xl">
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit Label' : 'Add Label'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="Label name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-muted h-auto rounded-lg px-3 py-2"
              />
              <div className="flex flex-wrap gap-2">
                {labelColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full ${color === c ? 'ring-primary scale-110 ring-2 ring-offset-2' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
                >
                  {editId ? 'Update' : 'Add'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={resetForm}
                  className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* List */}
        <div className="space-y-2">
          {labels.map((label) => (
            <div
              key={label.id}
              className="bg-card border-border flex items-center justify-between rounded-xl border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: label.color }} />
                <p className="text-sm font-medium">{label.name}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(label.id)}
                  className="h-8 w-8"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete "${label.name}"?`)) deleteLabel(label.id);
                  }}
                  className="h-8 w-8"
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {labels.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No labels yet. Add one to tag your transactions.
          </p>
        )}
      </Main>
    </>
  );
}
