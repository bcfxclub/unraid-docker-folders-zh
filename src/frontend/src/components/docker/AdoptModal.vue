<template>
  <BaseModal v-if="!inIframe" :is-open="isOpen" max-width="560px" @close="$emit('cancel')">
    <div class="px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold text-text">接管 {{ containerName }} 到 Unraid</h2>
      <p class="text-sm text-text-secondary mt-1">
        Unraid 接管此容器，以便你可以在 Docker 标签页中编辑它。
      </p>
    </div>

    <div class="max-h-[420px] overflow-auto px-6 py-4">
      <p v-if="error" class="text-sm text-error">{{ error }}</p>

      <p v-else-if="!data" class="text-sm text-text-secondary">正在读取容器…</p>

      <template v-else>
        <p class="text-sm text-text-secondary">{{ benefitsText }}</p>

        <p class="mt-3 text-sm text-warning">{{ warningText }}</p>

        <dl class="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
          <template v-for="row in rows" :key="row.label">
            <dt class="text-xs uppercase tracking-wide text-text-secondary pt-0.5">{{ row.label }}</dt>
            <dd class="text-sm text-text font-mono break-all whitespace-pre-line">{{ row.value }}</dd>
          </template>
        </dl>

        <p v-if="!data.portsPublished && hasPorts" class="mt-4 text-sm text-warning">
          {{ portsNote }}
        </p>

        <p v-if="!data.imageEnvKnown" class="mt-4 text-sm text-warning">
          该镜像无法读取，因此上面的变量可能包含了来自镜像而非你设置的值。
        </p>

        <div v-if="data.unmapped.length" class="mt-4">
          <p class="text-sm text-warning">以下设置没有对应的 Unraid 字段：</p>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="item in data.unmapped" :key="item" class="text-sm text-text-secondary">{{ item }}</li>
          </ul>
        </div>
      </template>
    </div>

    <div class="flex items-center gap-2 px-6 py-3 border-t border-border">
      <button
        type="button"
        class="nav-btn"
        :class="{ 'opacity-50 cursor-not-allowed': !data }"
        :disabled="!data"
        title="在不做任何更改的情况下，询问 Unraid 将要运行什么"
        @click="$emit('dry-run')"
      >试运行</button>
      <span class="flex-1"></span>
      <button type="button" class="nav-btn" @click="$emit('cancel')">取消</button>
      <button
        ref="confirmBtn"
        type="button"
        class="nav-btn warning"
        :class="{ 'opacity-50 cursor-not-allowed': !data }"
        :disabled="!data"
        @click="$emit('adopt')"
      >接管</button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import { useParentModal, type ModalField } from '@/composables/useParentModal';
import type { AdoptFields } from '@/utils/unraidHandoff';

interface Props {
  isOpen: boolean;
  containerName: string;
  /** Null while the field set is still being fetched. */
  data: AdoptFields | null;
  error?: string | null;
  /** A stopped container comes back running — see warningText. */
  isRunning?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  error: null,
  isRunning: true,
});

const emit = defineEmits<{
  adopt: [];
  'dry-run': [];
  cancel: [];
}>();

const confirmBtn = ref<HTMLButtonElement | null>(null);

/** Configs of one Type, in the order the builder emitted them. */
function ofType(type: string) {
  return (props.data?.configs ?? []).filter((c) => c.Type === type);
}

const hasPorts = computed(() => ofType('Port').length > 0);

/** Why a user would want this. The modal states the cost as well — see warningText. */
const benefitsText =
  '接管后由 Unraid 管理此容器。你可以在 Docker 标签页中使用编辑表单、'
  + '自动启动控制，以及可重复使用的模板。';

/**
 * A stopped container does not stay stopped. CreateDocker.php sets
 * $startContainer = true and only clears it in a rename branch that this flow
 * never reaches, so `docker create` becomes `docker run -d`.
 */
const warningText = computed(() => {
  const base = 'Unraid 会移除并重新创建此容器。任何写入挂载目录之外的数据都会丢失。';
  return props.isRunning ? base : `${base} 此容器已停止，接管后将被启动。`;
});

/**
 * On host, macvlan and ipvlan networks Unraid emits no -p at all. It passes the
 * host port as a TCP_PORT_n / UDP_PORT_n variable and the container answers on
 * its own address instead. Confirmed against Unraid's own xmlToCommand.
 */
const portsNote = computed(() => {
  const driver = props.data?.networkDriver || 'this';
  return `在 ${driver} 网络上，Unraid 不会发布端口。它会将它们作为 TCP_PORT / UDP_PORT 变量传递，容器会以自己的地址响应。`;
});

const rows = computed(() => {
  const data = props.data;
  if (!data) return [];

  const out: { label: string; value: string }[] = [
    { label: '镜像', value: data.fields.contRepository || '—' },
    { label: '网络', value: data.fields.contNetwork || '—' },
  ];

  const ports = ofType('Port').map((c) => `${c.Value}→${c.Target}/${c.Mode}`);
  if (ports.length) out.push({ label: '端口', value: ports.join('  ') });

  const paths = ofType('Path').map((c) => `${c.Value} → ${c.Target} (${c.Mode})`);
  if (paths.length) out.push({ label: '路径', value: paths.join('\n') });

  // Values are deliberately not shown. One of them may be a password, and the
  // point of Mask is that it does not get displayed.
  const vars = ofType('Variable').map((c) => (c.Mask === 'true' ? `${c.Target} (hidden)` : c.Target));
  if (vars.length) out.push({ label: '变量', value: vars.join('  ') });

  const labels = ofType('Label').map((c) => c.Target);
  if (labels.length) out.push({ label: '标签', value: labels.join('  ') });

  const devices = ofType('Device').map((c) => c.Value);
  if (devices.length) out.push({ label: '设备', value: devices.join('  ') });

  if (data.fields.contExtraParams) {
    out.push({ label: '额外参数', value: data.fields.contExtraParams });
  }
  if (data.fields.contPostArgs) {
    out.push({ label: '命令', value: data.fields.contPostArgs });
  }

  return out;
});

const parentModal = useParentModal({
  onAction({ actionId }) {
    if (actionId === 'adopt') emit('adopt');
    else if (actionId === 'dry-run') emit('dry-run');
    else emit('cancel');
  },
});

const { inIframe } = parentModal;

/**
 * The host renders a flat field list, so the same content is expressed as
 * heading/text fields rather than the grid above.
 */
function parentFields(): ModalField[] {
  const data = props.data;
  if (props.error) return [{ type: 'text', text: props.error, variant: 'error' }];
  if (!data) return [{ type: 'text', text: '正在读取容器…', variant: 'muted' }];

  const fields: ModalField[] = [
    { type: 'text', text: benefitsText, variant: 'muted' },
    { type: 'text', text: warningText.value, variant: 'error' },
  ];

  for (const row of rows.value) {
    fields.push({ type: 'heading', text: row.label });
    fields.push({ type: 'text', text: row.value, variant: 'muted' });
  }

  if (!data.portsPublished && hasPorts.value) {
    fields.push({ type: 'text', text: portsNote.value, variant: 'error' });
  }

  if (!data.imageEnvKnown) {
    fields.push({
      type: 'text',
      text: '该镜像无法读取，因此上面的变量可能包含了来自镜像而非你设置的值。',
      variant: 'error',
    });
  }

  if (data.unmapped.length) {
    fields.push({ type: 'heading', text: '无对应 Unraid 字段' });
    for (const item of data.unmapped) {
      fields.push({ type: 'text', text: item, variant: 'muted' });
    }
  }

  return fields;
}

function parentDescriptor() {
  return {
    kind: 'adopt' as const,
    title: `接管 ${props.containerName} 到 Unraid`,
    size: 'md' as const,
    fields: parentFields(),
    actions: [
      { id: 'dry-run', label: '试运行', variant: 'default' as const, disabled: !props.data },
      { id: 'cancel', label: '取消', variant: 'default' as const },
      { id: 'adopt', label: '接管', variant: 'danger' as const, disabled: !props.data },
    ],
  };
}

watch(
  () => [props.isOpen, props.data, props.error] as const,
  ([open]) => {
    if (inIframe) {
      // Re-opened rather than patched when the fetch lands: update() can only
      // change a field it can address by id, so it cannot swap a single loading
      // line for the whole summary.
      if (open) parentModal.open(parentDescriptor());
      else parentModal.close();
      return;
    }
    if (open) nextTick(() => confirmBtn.value?.focus());
  },
  { immediate: true },
);
</script>
