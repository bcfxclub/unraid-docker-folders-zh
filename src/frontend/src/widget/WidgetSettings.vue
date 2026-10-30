<template>
  <div class="mb-2 p-2 border border-border rounded">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs font-semibold text-text-secondary">小组件设置</span>
      <button
        class="icon-btn text-text-secondary hover:text-text leading-none"
        title="关闭设置"
        aria-label="关闭设置"
        @click="emit('close')"
      >&times;</button>
    </div>
    <label v-for="option in OPTIONS" :key="option.key" class="flex items-center gap-2 py-1 text-sm text-text cursor-pointer">
      <input
        type="checkbox"
        class="shrink-0 cursor-pointer"
        :checked="settings[option.key]"
        @change="emit('change', option.key, ($event.target as HTMLInputElement).checked)"
      />
      {{ option.label }}
    </label>
  </div>
</template>

<script setup lang="ts">
import type { WidgetSettings } from './widgetSettings';

defineProps<{ settings: WidgetSettings }>();

// One key per event, not a whole new object: two changes in the same tick
// would each copy the stale props and the second would undo the first.
const emit = defineEmits<{
  change: [key: keyof WidgetSettings, value: boolean];
  close: [];
}>();

const OPTIONS: Array<{ key: keyof WidgetSettings; label: string }> = [
  { key: 'hideStopped', label: '隐藏已停止的容器' },
  { key: 'startCollapsed', label: '文件夹默认折叠' },
  { key: 'showWebui', label: '显示 WebUI 图标' },
  { key: 'showIcons', label: '显示容器图标' },
  { key: 'showStats', label: '显示 CPU 和内存' },
  { key: 'showTags', label: '显示状态标签' },
];
</script>
