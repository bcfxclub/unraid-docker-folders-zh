<template>
  <ConfirmModal
    is-open
    :title="copy.title"
    :message="copy.message"
    :confirm-label="copy.title"
    variant="danger"
    checkbox-label="不再询问（可在 设置 > Docker 文件夹 中重新开启）"
    @confirm="emit('confirm', $event)"
    @cancel="emit('cancel')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import type { PendingStackAction } from '@/composables/useStackActionConfirm';

// Mounted only while an action is pending (see useStackActionConfirm).
const props = defineProps<{
  pending: PendingStackAction;
}>();

const emit = defineEmits<{
  confirm: [dontAskAgain: boolean];
  cancel: [];
}>();

// Both actions delete containers, so both say what survives and what is lost.
const copy = computed(() => {
  const { project, action } = props.pending;
  if (action === 'recompose') {
    return {
      title: '重建',
      message: `拉取 "${project}" 的最新镜像并重建其中的每个容器？即使没有任何变更，每个容器也会根据 Compose 文件被删除并重新创建。卷和 Compose 文件会被保留。容器在卷外写入的任何内容都会丢失。`,
    };
  }
  return {
      title: '停止堆栈',
      message: `对 "${project}" 运行 docker compose down？其容器和网络将被删除。卷和 Compose 文件会被保留，而 Compose Up 会创建新容器。容器在卷外写入的任何内容都会丢失。`,
  };
});
</script>
