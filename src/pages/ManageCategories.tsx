import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryType } from '@/types';

const categoryColors = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6C63FF', '#8b5cf6', '#ec4899', '#64748b', '#94a3b8',
];

export default function ManageCategories() {
  const navigate = useNavigate();
  const categories = useFinanceStore((s) => s.categories);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const updateCategory = useFinanceStore((s) => s.updateCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteCategory);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('expense');
  const [color, setColor] = useState(categoryColors[0]);
  const [icon, setIcon] = useState('circle-ellipsis');

  const [filter, setFilter] = useState<'all' | CategoryType>('all');

  const filtered = filter === 'all' ? categories : categories.filter((c) => c.type === filter || c.type === 'both');

  const handleEdit = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setEditId(id);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color);
    setIcon(cat.icon);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editId) {
      updateCategory(editId, { name: name.trim(), type, color, icon });
    } else {
      addCategory({ name: name.trim(), type, color, icon });
    }
    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setName('');
    setType('expense');
    setColor(categoryColors[0]);
    setIcon('circle-ellipsis');
  };

  return (
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Categories</h1>
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
        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'expense', 'income', 'both'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                filter === f ? 'bg-grad-primary text-white shadow' : 'bg-muted text-muted-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <Input
              type="text"
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-auto px-3 py-2 bg-muted rounded-lg"
            />
            <div className="flex gap-2">
              {(['expense', 'income', 'both'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                    type === t ? 'bg-grad-primary text-white shadow' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {categoryColors.map((c) => (
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
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cat.type}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(cat.id)}
                  className="w-8 h-8"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete "${cat.name}"?`)) deleteCategory(cat.id);
                  }}
                  className="w-8 h-8"
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
