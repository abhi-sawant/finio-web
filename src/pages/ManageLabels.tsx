import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const labelColors = [
  '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c',
  '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
];

export default function ManageLabels() {
  const navigate = useNavigate();
  const labels = useFinanceStore((s) => s.labels);
  const addLabel = useFinanceStore((s) => s.addLabel);
  const updateLabel = useFinanceStore((s) => s.updateLabel);
  const deleteLabel = useFinanceStore((s) => s.deleteLabel);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColors[0]);

  const handleEdit = (id: string) => {
    const label = labels.find((l) => l.id === id);
    if (!label) return;
    setEditId(id);
    setName(label.name);
    setColor(label.color);
    setShowForm(true);
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
    setShowForm(false);
    setEditId(null);
    setName('');
    setColor(labelColors[0]);
  };

  return (
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Labels</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="w-9 h-9 text-primary"
        >
          <Plus size={20} />
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <Input
              type="text"
              placeholder="Label name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-auto px-3 py-2 bg-muted rounded-lg"
            />
            <div className="flex gap-2 flex-wrap">
              {labelColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 h-auto py-2 bg-grad-primary text-white shadow-glow-primary rounded-lg text-sm font-medium"
              >
                {editId ? 'Update' : 'Add'}
              </Button>
              <Button
                variant="secondary"
                onClick={resetForm}
                className="h-auto px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-2">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <p className="text-sm font-medium">{label.name}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(label.id)}
                  className="w-8 h-8"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete "${label.name}"?`)) deleteLabel(label.id);
                  }}
                  className="w-8 h-8"
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {labels.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            No labels yet. Add one to tag your transactions.
          </p>
        )}
      </div>
    </div>
  );
}
