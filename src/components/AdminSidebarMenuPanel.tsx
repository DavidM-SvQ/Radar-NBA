import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  LayoutList,
  Lock,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_SIDEBAR_MENU_CONFIG_VALUES,
  SIDEBAR_SECTION_CATALOG,
  normalizeSidebarMenuConfig,
  type PublicSidebarSectionId,
  type SidebarMenuConfig,
  type SidebarMenuGroupConfig,
} from '../utils/sidebarMenuConfig';
import {
  fetchAdminSidebarMenuConfig,
  resetAdminSidebarMenuConfigDefaults,
  updateAdminSidebarMenuConfig,
} from '../utils/adminAuthClient';

interface AdminSidebarMenuPanelProps {
  currentConfig: SidebarMenuConfig;
  onConfigSaved: (saved: SidebarMenuConfig) => void;
  onLockSession: () => void;
}

const SECTION_META_BY_ID = new Map(
  SIDEBAR_SECTION_CATALOG.map((item) => [item.id, item])
);

function cloneGroups(groups: SidebarMenuGroupConfig[]): SidebarMenuGroupConfig[] {
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    itemIds: [...g.itemIds],
  }));
}

export function AdminSidebarMenuPanel({
  currentConfig,
  onConfigSaved,
  onLockSession,
}: AdminSidebarMenuPanelProps) {
  const [savedConfig, setSavedConfig] = useState<SidebarMenuConfig>(currentConfig);
  const [draftGroups, setDraftGroups] = useState<SidebarMenuGroupConfig[]>(() =>
    cloneGroups(currentConfig.groups)
  );
  const [draftHiddenIds, setDraftHiddenIds] = useState<Set<PublicSidebarSectionId>>(
    () => new Set(currentConfig.hiddenIds)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [draggedItem, setDraggedItem] = useState<{
    sectionId: PublicSidebarSectionId;
    fromGroupId: string;
  } | null>(null);
  const [previewMode, setPreviewMode] = useState<'grouped' | 'flat'>('grouped');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAdminSidebarMenuConfig()
      .then((res) => {
        if (!active) return;
        if (res.unauthorized) {
          onLockSession();
          return;
        }
        if (res.ok && res.config) {
          const normalized = normalizeSidebarMenuConfig(res.config);
          setSavedConfig(normalized);
          setDraftGroups(cloneGroups(normalized.groups));
          setDraftHiddenIds(new Set(normalized.hiddenIds));
          onConfigSaved(normalized);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isDirty = useMemo(() => {
    const savedNorm = JSON.stringify({
      groups: savedConfig.groups,
      hiddenIds: [...savedConfig.hiddenIds].sort(),
    });
    const draftNorm = JSON.stringify({
      groups: draftGroups,
      hiddenIds: Array.from(draftHiddenIds).sort(),
    });
    return savedNorm !== draftNorm;
  }, [savedConfig, draftGroups, draftHiddenIds]);

  const visibleCount = SIDEBAR_SECTION_CATALOG.length - draftHiddenIds.size;

  const handleMoveGroup = (groupIdx: number, direction: -1 | 1) => {
    const targetIdx = groupIdx + direction;
    if (targetIdx < 0 || targetIdx >= draftGroups.length) return;
    setDraftGroups((prev) => {
      const next = cloneGroups(prev);
      const [moved] = next.splice(groupIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setFeedback(null);
  };

  const handleRenameGroup = (groupId: string, label: string) => {
    setDraftGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, label: label.slice(0, 48) } : g))
    );
    setFeedback(null);
  };

  const handleAddGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed || draftGroups.length >= 8) return;
    const slug =
      trimmed
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || `bloque_${draftGroups.length + 1}`;
    const existingIds = new Set(draftGroups.map((g) => g.id));
    let uniqueId = slug;
    let suffix = 2;
    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}_${suffix++}`;
    }
    setDraftGroups((prev) => [
      ...cloneGroups(prev),
      { id: uniqueId, label: trimmed.slice(0, 48), itemIds: [] },
    ]);
    setNewGroupName('');
    setFeedback(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (draftGroups.length <= 1) return;
    setDraftGroups((prev) => {
      const target = prev.find((g) => g.id === groupId);
      const remaining = cloneGroups(prev.filter((g) => g.id !== groupId));
      if (target && target.itemIds.length > 0 && remaining.length > 0) {
        remaining[0].itemIds.push(...target.itemIds);
      }
      return remaining;
    });
    setFeedback(null);
  };

  const handleMoveItemWithinGroup = (
    groupId: string,
    itemIdx: number,
    direction: -1 | 1
  ) => {
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const targetIdx = itemIdx + direction;
        if (targetIdx < 0 || targetIdx >= g.itemIds.length) return g;
        const nextItems = [...g.itemIds];
        const [moved] = nextItems.splice(itemIdx, 1);
        nextItems.splice(targetIdx, 0, moved);
        return { ...g, itemIds: nextItems };
      })
    );
    setFeedback(null);
  };

  const handleMoveItemToGroup = (
    sectionId: PublicSidebarSectionId,
    fromGroupId: string,
    toGroupId: string,
    insertBeforeId?: PublicSidebarSectionId
  ) => {
    if (fromGroupId === toGroupId && !insertBeforeId) return;
    setDraftGroups((prev) => {
      const next = cloneGroups(prev);
      const sourceGroup = next.find((g) => g.id === fromGroupId);
      const targetGroup = next.find((g) => g.id === toGroupId);
      if (!sourceGroup || !targetGroup) return prev;

      const srcIdx = sourceGroup.itemIds.indexOf(sectionId);
      if (srcIdx === -1) return prev;
      sourceGroup.itemIds.splice(srcIdx, 1);

      if (insertBeforeId) {
        const destIdx = targetGroup.itemIds.indexOf(insertBeforeId);
        if (destIdx >= 0) {
          targetGroup.itemIds.splice(destIdx, 0, sectionId);
        } else {
          targetGroup.itemIds.push(sectionId);
        }
      } else {
        targetGroup.itemIds.push(sectionId);
      }
      return next;
    });
    setFeedback(null);
  };

  const handleToggleVisibility = (sectionId: PublicSidebarSectionId) => {
    if (sectionId === 'home') return;
    setDraftHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
    setFeedback(null);
  };

  const handleDiscard = () => {
    setDraftGroups(cloneGroups(savedConfig.groups));
    setDraftHiddenIds(new Set(savedConfig.hiddenIds));
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const cleanedGroups = draftGroups
      .filter((g) => g.label.trim().length > 0)
      .map((g) => ({
        id: g.id,
        label: g.label.trim(),
        itemIds: [...g.itemIds],
      }));

    const payload = {
      groups:
        cleanedGroups.length > 0
          ? cleanedGroups
          : cloneGroups(DEFAULT_SIDEBAR_MENU_CONFIG_VALUES.groups),
      hiddenIds: Array.from(draftHiddenIds).filter((id) => id !== 'home'),
    };

    const res = await updateAdminSidebarMenuConfig(payload);
    setSaving(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      const normalized = normalizeSidebarMenuConfig(res.config);
      setSavedConfig(normalized);
      setDraftGroups(cloneGroups(normalized.groups));
      setDraftHiddenIds(new Set(normalized.hiddenIds));
      onConfigSaved(normalized);
      setFeedback({
        type: 'success',
        message: 'Orden y bloques del menú lateral guardados y aplicados al instante.',
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'No se pudo guardar la configuración del menú lateral.',
      });
    }
  };

  const handleResetDefaults = async () => {
    setResetting(true);
    setFeedback(null);
    const res = await resetAdminSidebarMenuConfigDefaults();
    setResetting(false);
    if (res.unauthorized) {
      onLockSession();
      return;
    }
    if (res.ok && res.config) {
      const normalized = normalizeSidebarMenuConfig(res.config);
      setSavedConfig(normalized);
      setDraftGroups(cloneGroups(normalized.groups));
      setDraftHiddenIds(new Set(normalized.hiddenIds));
      onConfigSaved(normalized);
      setFeedback({
        type: 'success',
        message: 'Menú lateral restablecido a su estructura original.',
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'No se pudo restablecer el menú lateral.',
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Action Bar */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LayoutList className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Navegación Global · Broadcast 3.0, v2 Pro y Clásico</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {draftGroups.length} bloques · {visibleCount}/{SIDEBAR_SECTION_CATALOG.length} visibles
            </span>
          </div>
          <h3 className="font-display text-lg font-bold text-slate-100">
            Organizador del Menú Lateral
          </h3>
          <p className="text-xs text-slate-400 max-w-2xl">
            Reordena los apartados arrastrándolos o con las flechas, mueve secciones entre bloques, renombra o crea nuevos grupos y oculta apartados secundarios. Los cambios se aplican inmediatamente a todo el menú lateral.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={resetting || saving}
            className="h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer original
          </button>

          {isDirty && (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              className="h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-rose-500/50 text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
            >
              Descartar
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-45"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : 'Guardar menú'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main 2-Column Workspace: Editor (8 cols) + Live Preview (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Groups & Sections Editor */}
        <div className="xl:col-span-8 space-y-4">
          {/* Add New Group Bar */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddGroup();
                }
              }}
              maxLength={48}
              placeholder="Nombre del nuevo bloque (ej. Mercado y Draft)..."
              className="flex-1 h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
            />
            <button
              type="button"
              onClick={handleAddGroup}
              disabled={!newGroupName.trim() || draftGroups.length >= 8}
              className="h-9 px-3.5 rounded-lg bg-[#0B1120] border border-orange-500/40 hover:bg-orange-500 hover:text-slate-950 text-xs font-semibold text-orange-300 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-40"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Añadir bloque ({draftGroups.length}/8)
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 bg-[#131C2E] border border-[#1E293B] rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {draftGroups.map((group, groupIdx) => (
                <div
                  key={group.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedItem) return;
                    if (draggedItem.fromGroupId !== group.id) {
                      handleMoveItemToGroup(
                        draggedItem.sectionId,
                        draggedItem.fromGroupId,
                        group.id
                      );
                    }
                    setDraggedItem(null);
                  }}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg overflow-hidden"
                >
                  {/* Group Header */}
                  <div className="px-4 py-3 bg-[#0B1120] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <span className="font-mono tabular-nums text-[11px] font-bold text-orange-400">
                        {String(groupIdx + 1).padStart(2, '0')}
                      </span>
                      <input
                        type="text"
                        aria-label={`Nombre del bloque ${groupIdx + 1}`}
                        value={group.label}
                        onChange={(e) => handleRenameGroup(group.id, e.target.value)}
                        maxLength={48}
                        className="flex-1 h-8 px-2.5 rounded-md bg-[#131C2E] border border-[#1E293B] text-xs font-bold text-slate-100 focus:outline-none focus:border-orange-500/70"
                      />
                      <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {group.itemIds.length} apart.
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(groupIdx, -1)}
                        disabled={groupIdx === 0}
                        title="Subir bloque"
                        aria-label="Subir bloque"
                        className="h-8 w-8 rounded-md bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 text-slate-300 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(groupIdx, 1)}
                        disabled={groupIdx === draftGroups.length - 1}
                        title="Bajar bloque"
                        aria-label="Bajar bloque"
                        className="h-8 w-8 rounded-md bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 text-slate-300 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={draftGroups.length <= 1}
                        title="Eliminar bloque (sus apartados pasan al bloque 1)"
                        aria-label="Eliminar bloque"
                        className="h-8 w-8 rounded-md bg-[#131C2E] border border-[#1E293B] hover:border-rose-500/60 hover:text-rose-400 text-slate-400 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Group Items */}
                  <div className="divide-y divide-[#1E293B]/60">
                    {group.itemIds.length === 0 ? (
                      <div className="px-4 py-5 text-center text-xs text-slate-500">
                        Bloque vacío — arrastra aquí cualquier apartado o muévelo con el selector de bloque.
                      </div>
                    ) : (
                      group.itemIds.map((sectionId, itemIdx) => {
                        const meta = SECTION_META_BY_ID.get(sectionId);
                        const isHidden = draftHiddenIds.has(sectionId);
                        const isPinnedHome = sectionId === 'home';

                        return (
                          <div
                            key={sectionId}
                            draggable
                            onDragStart={() =>
                              setDraggedItem({ sectionId, fromGroupId: group.id })
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!draggedItem || draggedItem.sectionId === sectionId) {
                                setDraggedItem(null);
                                return;
                              }
                              handleMoveItemToGroup(
                                draggedItem.sectionId,
                                draggedItem.fromGroupId,
                                group.id,
                                sectionId
                              );
                              setDraggedItem(null);
                            }}
                            onDragEnd={() => setDraggedItem(null)}
                            className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                              isHidden
                                ? 'bg-[#0B1120]/50 opacity-60'
                                : 'hover:bg-[#182338]/60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GripVertical
                                className="w-4 h-4 text-slate-500 cursor-grab shrink-0"
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-100 truncate">
                                    {meta?.defaultLabel || sectionId}
                                  </span>
                                  {isPinnedHome && (
                                    <span className="text-[10px] font-mono text-amber-300 inline-flex items-center gap-0.5">
                                      <Lock className="w-2.5 h-2.5" />
                                      Portada fija
                                    </span>
                                  )}
                                  {isHidden && (
                                    <span className="text-[10px] font-mono text-rose-300">
                                      Oculto
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {meta?.descriptionEs}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                              {/* Move to another group selector */}
                              <select
                                aria-label={`Mover ${meta?.defaultLabel || sectionId} a otro bloque`}
                                value={group.id}
                                onChange={(e) =>
                                  handleMoveItemToGroup(sectionId, group.id, e.target.value)
                                }
                                className="h-7 px-2 rounded-md bg-[#0B1120] border border-[#1E293B] text-[11px] text-slate-200 focus:outline-none focus:border-orange-500/60 max-w-[150px]"
                              >
                                {draftGroups.map((gOpt) => (
                                  <option key={gOpt.id} value={gOpt.id}>
                                    {gOpt.label}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() =>
                                  handleMoveItemWithinGroup(group.id, itemIdx, -1)
                                }
                                disabled={itemIdx === 0}
                                title="Subir apartado"
                                aria-label="Subir apartado"
                                className="h-7 w-7 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-slate-300 inline-flex items-center justify-center disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleMoveItemWithinGroup(group.id, itemIdx, 1)
                                }
                                disabled={itemIdx === group.itemIds.length - 1}
                                title="Bajar apartado"
                                aria-label="Bajar apartado"
                                className="h-7 w-7 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-slate-300 inline-flex items-center justify-center disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleVisibility(sectionId)}
                                disabled={isPinnedHome}
                                title={
                                  isPinnedHome
                                    ? 'La portada no se puede ocultar'
                                    : isHidden
                                    ? 'Mostrar en menú lateral'
                                    : 'Ocultar del menú lateral'
                                }
                                aria-label={
                                  isHidden
                                    ? 'Mostrar en menú lateral'
                                    : 'Ocultar del menú lateral'
                                }
                                className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-30 ${
                                  isHidden
                                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:border-emerald-500/50'
                                    : 'bg-[#0B1120] border-[#1E293B] text-slate-300 hover:border-orange-500/60'
                                }`}
                              >
                                {isHidden ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Live Sidebar Preview */}
        <div className="xl:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3 xl:sticky xl:top-20">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#1E293B]">
            <div>
              <h4 className="text-xs font-bold text-slate-100">Vista previa en vivo</h4>
              <p className="text-[11px] text-slate-400">
                Así verá el usuario el menú lateral
              </p>
            </div>
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-md">
              <button
                type="button"
                onClick={() => setPreviewMode('grouped')}
                className={`h-6 px-2 rounded text-[10px] font-semibold transition-colors ${
                  previewMode === 'grouped'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                v3 Bloques
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('flat')}
                className={`h-6 px-2 rounded text-[10px] font-semibold transition-colors ${
                  previewMode === 'flat'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                v1/v2 Lista
              </button>
            </div>
          </div>

          <div className="bg-[#070C17] border border-[#1E293B] rounded-lg p-3 space-y-3 max-h-[560px] overflow-y-auto">
            {previewMode === 'grouped' ? (
              draftGroups.map((group) => {
                const visibleItems = group.itemIds.filter(
                  (id) => !draftHiddenIds.has(id)
                );
                if (visibleItems.length === 0) return null;
                return (
                  <div key={group.id} className="space-y-1">
                    <div className="px-2 text-[10px] font-semibold text-slate-500 tracking-wide">
                      {group.label}
                    </div>
                    {visibleItems.map((id, idx) => {
                      const meta = SECTION_META_BY_ID.get(id);
                      return (
                        <div
                          key={id}
                          className={`px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between ${
                            id === 'home'
                              ? 'bg-amber-500/15 border border-amber-400/30 text-amber-300 font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          <span className="truncate">{meta?.defaultLabel || id}</span>
                          <span className="font-mono tabular-nums text-[10px] text-slate-500">
                            {idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="space-y-1">
                {draftGroups
                  .flatMap((g) => g.itemIds)
                  .filter((id) => !draftHiddenIds.has(id))
                  .map((id, idx) => {
                    const meta = SECTION_META_BY_ID.get(id);
                    return (
                      <div
                        key={id}
                        className={`px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between ${
                          id === 'home'
                            ? 'bg-orange-500 text-slate-950 font-semibold'
                            : 'text-slate-300'
                        }`}
                      >
                        <span className="truncate">{meta?.defaultLabel || id}</span>
                        <span
                          className={`font-mono tabular-nums text-[10px] ${
                            id === 'home' ? 'text-slate-950/75' : 'text-slate-500'
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed">
            Nota: los apartados ocultos siguen siendo accesibles por enlace directo o desde el buscador global (`Ctrl+K`) para no romper ninguna navegación interna.
          </div>
        </div>
      </div>
    </div>
  );
}
