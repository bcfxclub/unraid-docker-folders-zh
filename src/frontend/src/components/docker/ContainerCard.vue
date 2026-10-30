<template>
  <!-- Grid (card) view -->
  <div v-if="view === 'grid'" class="container-card-enter flex flex-col border border-border/50 rounded-lg bg-bg-card hover:border-border hover:shadow-sm transition" :class="{ 'state-change-pulse': stateChangePulse, 'z-50': menuOpen, 'col-span-full': expanded }" :data-container-id="container.id">
    <!-- Everything above the action footer toggles the card. Only the footer
         (all buttons/links) and the expanded body are excluded. -->
    <div class="cursor-pointer select-none" @click="expanded = !expanded">
      <div class="flex items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-6 pb-0">
        <DragHandle v-if="!dragLocked" handle-class="drag-handle shrink-0 text-muted cursor-grab active:cursor-grabbing" @click.stop />
        <ContainerIcon
          :src="container.icon || FALLBACK_CONTAINER_ICON"
          :alt="container.name"
          :halo-class="status.halo"
          :status-tooltip="status.tooltip"
          :href="iconWebui"
        />
        <h3 class="flex-1 text-sm font-semibold text-text truncate">{{ container.name }}</h3>
        <a
          v-if="hasUpdate && releaseNotesUrl"
          :href="releaseNotesUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning hover:bg-warning/30"
          title="查看发布说明"
          @click.stop
        >更新</a>
        <span
          v-else-if="hasUpdate"
          class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning"
        >更新</span>
        <span
          v-else-if="needsRecreate"
          class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning"
          :title="needsRecreateTitle"
        >未应用</span>
        <span
          v-if="checkingUpdates"
          class="shrink-0 inline-flex items-center gap-1 text-[10px] text-text-secondary"
          title="正在检查镜像更新"
        >
          <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
          检查中
        </span>
        <span
          v-if="hasPortConflict"
          class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-error/15 text-error"
          :title="portConflictTitle"
        >端口冲突</span>
        <!-- The pill lives on the inner span, not the button: the Unraid reset
             zeroes padding/background/radius on any button without .nav-btn
             (DESIGN.md §11), and a .nav-btn does not look like a badge. -->
        <button
          v-if="securityFindings.length > 0"
          class="shrink-0"
          :title="securityTitle"
          :aria-label="securityAriaLabel"
          @click.stop="emit('security', container.id)"
        >
          <span
            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded cursor-pointer"
            :class="securityBadgeClass"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="SHIELD_ICON" /></svg>
            {{ securityFindings.length }}
          </span>
        </button>
      </div>

      <!-- Summary row — carries the chevron affordance -->
      <div class="flex items-center gap-2 px-4 sm:px-6 py-2">
        <p class="flex-1 text-[11px] text-text-secondary font-mono truncate min-w-0">
          <ImageLink :image="container.image" :href="imageLink" />
        </p>
        <span class="text-[11px] shrink-0" :class="status.crashed ? 'text-error' : 'text-text'" :title="status.tooltip">{{ container.status }}</span>
        <ChevronIcon :expanded="expanded" />
      </div>

      <ActionFailureLine :container="container" class="px-4 sm:px-6 pb-1" />
      <PortProblemLine :container="container" class="px-4 sm:px-6 pb-1" />
  
      <!-- Compact ports (collapsed) -->
      <div v-if="compactPorts && !expanded" class="px-4 sm:px-6 pb-0.5">
        <span class="text-[11px] text-text font-mono truncate block">端口：{{ compactPorts }}</span>
      </div>
  
      <!-- Compact stats loading state -->
      <div v-if="isRunning && showStats && !containerStats && !expanded" class="px-4 sm:px-6 pb-1 space-y-1">
        <StatsBar label="CPU" :percent="null" />
        <StatsBar label="内存" :percent="null" />
      </div>
  
      <!-- Compact stats bars (always visible for running containers) -->
      <div v-if="isRunning && containerStats && !expanded" class="px-4 sm:px-6 pb-1 space-y-1">
        <StatsBar label="CPU" :percent="containerStats.cpuPercent" />
        <StatsBar label="内存" :percent="containerStats.memoryPercent" />
        <div v-if="containerStats.restartCount > 0" class="flex items-center gap-2 text-xs">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-error/15 text-error rounded text-[11px] font-mono font-medium">
            {{ containerStats.restartCount }} 次重启
          </span>
        </div>
      </div>
    </div>

    <!-- Accordion details -->
    <Transition @enter="expandEnter" @after-enter="expandAfterEnter" @leave="expandLeave" @after-leave="expandAfterLeave">
      <div v-if="expanded" class="overflow-hidden">
        <ContainerDetails
          class="block px-4 sm:px-6 pb-2 pt-3 border-t border-border"
          v-bind="detailsProps"
          @refresh-logs="refreshLogs"
        />
      </div>
    </Transition>

    <div class="flex items-center gap-3 px-4 py-2 sm:px-6 sm:py-3 mt-auto border-t border-border/30">
      <template v-if="isActionInProgress">
        <div class="flex items-center gap-2 text-xs text-text-secondary">
          <svg class="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span>{{ actionStatusText }}</span>
        </div>
      </template>
      <template v-else>
      <button v-if="isPaused" @click="emit('resume', container.id)" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-success hover:bg-success hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="恢复"><IconPlay :size="20" /></button>
      <button v-else-if="isRunning" @click="confirmAction = 'stop'" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-error hover:bg-error hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="停止"><IconStop :size="20" /></button>
      <button v-else @click="emit('start', container.id)" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-success hover:bg-success hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="启动"><IconPlay :size="20" /></button>
      <button v-if="isRunning" @click="confirmAction = 'restart'" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-primary hover:bg-primary hover:text-primary-text disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="重启"><IconRestart :size="20" /></button>
      <button v-if="isStopped" @click="confirmAction = 'remove'" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-muted hover:bg-error hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="删除"><IconTrash :size="20" /></button>
      <button v-if="hasUpdate" @click="emit('pull', pullPayload())" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-warning hover:bg-warning hover:text-white" title="拉取更新"><IconDownload :size="20" /></button>
      <!-- Adopt: only for a container Unraid does not manage yet -->
      <button v-if="canAdopt" @click.stop="openAdopt" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-primary hover:bg-primary hover:text-primary-text" title="接管到 Unraid —— 由 Unraid 管理此容器"><IconAdopt :size="20" /></button>
      </template>
      <!-- Autostart toggle -->
      <button v-if="isManaged" @click.stop="handleToggleAutostart" class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed" :class="container.autostart ? 'text-success' : 'text-text-secondary hover:text-success'" :title="container.autostart ? '自动启动：开（点击停用）' : '自动启动：关（点击启用）'"><IconAutostart :size="20" /></button>
      <span v-else class="flex items-center justify-center w-8 h-8 rounded text-text-secondary opacity-30" :title="`自动启动：${manageHint}`"><IconAutostart :size="20" /></span>
      <!-- WebUI (always shown, disabled when no webui) -->
      <a v-if="resolvedWebui && isRunning" :href="resolvedWebui" target="_blank" rel="noopener" class="flex items-center justify-center w-8 h-8 ml-auto rounded text-text-secondary hover:text-primary transition" title="打开 WebUI" @click.stop><IconGlobe :size="20" /></a>
      <span v-else class="flex items-center justify-center w-8 h-8 ml-auto rounded text-text-secondary opacity-30" title="未配置 WebUI。在容器的 Unraid 模板中设置 WebUI 字段以启用此项。"><IconGlobe :size="20" /></span>
      <!-- Kebab menu -->
      <KebabMenu
        ref="kebabMenuRef"
        :items="menuItems"
        position="above"
        button-class="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-text-secondary hover:text-text"
        :class="{ 'ml-auto': !resolvedWebui || !isRunning }"
        @select="handleMenuAction"
      />
    </div>
  </div>

  <!-- List view -->
  <div v-else class="container-card-enter container-row rounded transition border-b border-border/50" :class="{ 'state-change-pulse': stateChangePulse, 'z-50': menuOpen }" :data-container-id="container.id">
    <div class="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 py-3 cursor-pointer select-none" @click="expanded = !expanded">
      <DragHandle v-if="!dragLocked" :size="14" handle-class="drag-handle shrink-0 text-muted cursor-grab active:cursor-grabbing -mr-2" @click.stop />
      <ChevronIcon :expanded="expanded" :size="12" />
      <ContainerIcon
        :src="container.icon || FALLBACK_CONTAINER_ICON"
        :alt="container.name"
        :halo-class="status.halo"
        :status-tooltip="status.tooltip"
        :href="iconWebui"
      />

      <div class="flex flex-col flex-1 min-w-0 gap-0.5">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xs font-semibold text-text truncate">{{ container.name }}</span>
          <a
            v-if="hasUpdate && releaseNotesUrl"
            :href="releaseNotesUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning hover:bg-warning/30"
            title="查看发布说明"
            @click.stop
          >更新</a>
          <span
            v-else-if="hasUpdate"
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning"
          >更新</span>
          <span
            v-else-if="needsRecreate"
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-warning/20 text-warning"
            :title="needsRecreateTitle"
          >未应用</span>
          <span
            v-if="checkingUpdates"
            class="shrink-0 inline-flex items-center gap-1 text-[10px] text-text-secondary"
            title="正在检查镜像更新"
          >
            <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            检查中
          </span>
          <span
            v-if="hasPortConflict"
            class="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-error/15 text-error"
            :title="portConflictTitle"
          >端口冲突</span>
          <!-- See the grid branch: the pill has to sit on a child of the
               button, because the reset strips it from the button itself. -->
          <button
            v-if="securityFindings.length > 0"
            class="shrink-0"
            :title="securityTitle"
            :aria-label="securityAriaLabel"
            @click.stop="emit('security', container.id)"
          >
            <span
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded cursor-pointer"
              :class="securityBadgeClass"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="SHIELD_ICON" /></svg>
              {{ securityFindings.length }}
            </span>
          </button>
          <span class="hidden sm:inline text-[11px] truncate" :class="status.crashed ? 'text-error' : 'text-text-secondary'" :title="status.tooltip">{{ container.status }}</span>
        </div>
        <span class="text-[11px] text-text-secondary font-mono truncate">
          <ImageLink :image="container.image" :href="imageLink" />
        </span>
        <ActionFailureLine :container="container" />
        <PortProblemLine :container="container" />
      </div>

      <!-- Compact ports (list collapsed) -->
      <span v-if="compactPorts && !expanded" class="hidden sm:inline shrink-0 text-[11px] text-text font-mono">{{ compactPorts }}</span>

      <!-- Inline compact stats loading (list view) -->
      <div v-if="isRunning && showStats && !containerStats && !expanded" class="hidden md:block shrink-0 w-[140px] space-y-0.5">
        <StatsBar label="CPU" :percent="null" size="inline" />
        <StatsBar label="内存" :percent="null" size="inline" />
      </div>

      <!-- Inline compact stats (list view) -->
      <div v-if="isRunning && containerStats && !expanded" class="hidden md:flex shrink-0 items-center gap-3">
        <div class="w-[140px] space-y-0.5">
          <StatsBar label="CPU" :percent="containerStats.cpuPercent" size="inline" />
          <StatsBar label="内存" :percent="containerStats.memoryPercent" size="inline" />
        </div>
        <span v-if="containerStats.restartCount > 0" class="inline-flex items-center px-1.5 py-0.5 bg-error/15 text-error rounded text-[11px] font-mono font-medium shrink-0" :title="`${containerStats.restartCount} 次重启`">
          {{ containerStats.restartCount }} 次重启
        </span>
      </div>

      <div class="flex gap-1 ml-auto shrink-0 items-center" @click.stop>
        <template v-if="isActionInProgress">
          <div class="flex items-center gap-1.5 text-xs text-text-secondary mr-1">
            <svg class="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{{ actionStatusText }}</span>
          </div>
        </template>
        <template v-else>
        <!-- WebUI (always shown, disabled when no webui) -->
        <a v-if="resolvedWebui && isRunning" :href="resolvedWebui" target="_blank" rel="noopener" class="hidden sm:flex items-center justify-center w-8 h-8 rounded text-text-secondary hover:text-primary transition" title="打开 WebUI" @click.stop><IconGlobe :size="18" /></a>
        <span v-else class="hidden sm:flex items-center justify-center w-8 h-8 rounded text-text-secondary opacity-30" title="未配置 WebUI。在容器的 Unraid 模板中设置 WebUI 字段以启用此项。"><IconGlobe :size="18" /></span>
        <button v-if="isPaused" @click="emit('resume', container.id)" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-success hover:bg-success hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="恢复"><IconPlay :size="18" /></button>
        <button v-else-if="isRunning" @click="confirmAction = 'stop'" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-error hover:bg-error hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="停止"><IconStop :size="18" /></button>
        <button v-else @click="emit('start', container.id)" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-success hover:bg-success hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="启动"><IconPlay :size="18" /></button>
        <button v-if="isRunning" @click="confirmAction = 'restart'" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-primary hover:bg-primary hover:text-primary-text disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="重启"><IconRestart :size="18" /></button>
        <button v-if="isStopped" @click="confirmAction = 'remove'" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-muted hover:bg-error hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isActionInProgress" title="删除"><IconTrash :size="18" /></button>
        <button v-if="hasUpdate" @click="emit('pull', pullPayload())" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-warning hover:bg-warning hover:text-white" title="拉取更新"><IconDownload :size="18" /></button>
        <!-- Adopt: only for a container Unraid does not manage yet -->
        <button v-if="canAdopt" @click.stop="openAdopt" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-primary hover:bg-primary hover:text-primary-text" title="接管到 Unraid —— 由 Unraid 管理此容器"><IconAdopt :size="18" /></button>
        <button v-if="isManaged" @click.stop="handleToggleAutostart" class="action-btn hidden sm:flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed" :class="container.autostart ? 'text-success' : 'text-text-secondary hover:text-success'" :title="container.autostart ? '自动启动：开（点击停用）' : '自动启动：关（点击启用）'"><IconAutostart :size="18" /></button>
        <span v-else class="action-btn hidden sm:flex items-center justify-center w-8 h-8 rounded text-text-secondary opacity-30" :title="`自动启动：${manageHint}`"><IconAutostart :size="18" /></span>
        </template>
        <!-- Kebab menu -->
        <KebabMenu
          ref="kebabMenuRef"
          :items="menuItems"
          button-class="action-btn flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition text-text-secondary hover:text-text"
          :icon-size="14"
          @select="handleMenuAction"
        />
      </div>
    </div>

    <!-- List accordion details -->
    <Transition @enter="expandEnter" @after-enter="expandAfterEnter" @leave="expandLeave" @after-leave="expandAfterLeave">
      <div v-if="expanded" class="overflow-hidden">
        <ContainerDetails
          class="block px-2 sm:px-4 pb-4 pt-2 border-t border-border"
          v-bind="detailsProps"
          @refresh-logs="refreshLogs"
        />
      </div>
    </Transition>
  </div>

  <Teleport to="body">
    <ConfirmModal
      :is-open="!!confirmAction"
      :title="confirmModalConfig.title"
      :message="confirmModalConfig.message"
      :confirm-label="confirmModalConfig.label"
      :variant="confirmModalConfig.variant"
      :checkbox-label="confirmAction === 'remove' ? `同时删除镜像（${container.image}）` : undefined"
      @confirm="handleConfirm"
      @cancel="confirmAction = null"
    />
    <InputModal
      :is-open="showDelayModal"
      title="自动启动延迟"
      :description="`设置 ${container.name} 自动启动前的延迟（秒）。`"
      :initial-value="String(container.autostartDelay)"
      placeholder="0"
      suffix="启动时启动该容器前等待的秒数。"
      input-type="number"
      confirm-label="保存"
      @confirm="handleDelayConfirm"
      @cancel="showDelayModal = false"
    />
    <SelectModal
      :is-open="showFolderPicker"
      :title="`${folderVerb} 到文件夹`"
      :description="`为 ${container.name} 选择文件夹。`"
      :options="folderTargets"
      :confirm-label="folderVerb"
      @confirm="handleFolderPicked"
      @cancel="showFolderPicker = false"
    />
    <AdoptModal
      :is-open="adoptOpen"
      :container-name="container.name"
      :data="adoptData"
      :error="adoptError"
      :is-running="isRunning"
      @adopt="runAdopt(false)"
      @dry-run="runAdopt(true)"
      @cancel="adoptOpen = false"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, onUnmounted, type Ref } from 'vue';
import { useDockerStore, type Container, type PullRequest } from '@/stores/docker';
import { useSettingsStore } from '@/stores/settings';
import { useUpdatesStore } from '@/stores/updates';
import { useSecurityStore } from '@/stores/security';
import { useFolderStore } from '@/stores/folders';
import { useContainerStats } from '@/composables/useContainerStats';
import { useIsMobile } from '@/composables/useIsMobile';
import { useBackend } from '@/backends';
import { composeProjectOf, releaseIndexUrl } from '@/utils/updateUnits';
import { submitAdopt, type AdoptFields } from '@/utils/unraidHandoff';
import ConfirmModal from '@/components/ConfirmModal.vue';
import InputModal from '@/components/InputModal.vue';
import SelectModal from '@/components/SelectModal.vue';
import AdoptModal from '@/components/docker/AdoptModal.vue';
import KebabMenu from '@/components/KebabMenu.vue';
import type { KebabMenuItem } from '@/components/KebabMenu.vue';
import { byLabel } from '@/utils/menu';
import { AUTOSTART_ICON, DOWNLOAD_ICON, EDIT_ICON, GEAR_ICON, PLAY_ICON, REFRESH_ICON, SHIELD_ICON, STOPWATCH_ICON, TRASH_ICON } from '@/utils/menuIcons';
import StatsBar from '@/components/common/StatsBar.vue';
import DragHandle from '@/components/common/DragHandle.vue';
import ChevronIcon from '@/components/common/ChevronIcon.vue';
import ImageLink from '@/components/common/ImageLink.vue';
import ContainerDetails from '@/components/docker/ContainerDetails.vue';
import ContainerIcon from '@/components/docker/ContainerIcon.vue';
import { containerStatus, containerEditUrl, containerWebuiUrl, FALLBACK_CONTAINER_ICON, isRunningContainer, openContainerTerminal } from '@/utils/containerDisplay';
import { imageRegistryUrl } from '@/utils/imageRegistry';
import IconPlay from '@/components/icons/IconPlay.vue';
import IconStop from '@/components/icons/IconStop.vue';
import IconRestart from '@/components/icons/IconRestart.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconDownload from '@/components/icons/IconDownload.vue';
import IconGlobe from '@/components/icons/IconGlobe.vue';
import IconAutostart from '@/components/icons/IconAutostart.vue';
import IconAdopt from '@/components/icons/IconAdopt.vue';
import ActionFailureLine from '@/components/docker/ActionFailureLine.vue';
import PortProblemLine from '@/components/docker/PortProblemLine.vue';

const isMobile = useIsMobile();
const dockerStore = useDockerStore();
const kebabMenuRef = ref<InstanceType<typeof KebabMenu> | null>(null);
const menuOpen = computed(() => kebabMenuRef.value?.menuOpen ?? false);

interface Props {
  container: Container;
  actionInProgress?: string | null;
  view?: 'grid' | 'list';
}

const props = withDefaults(defineProps<Props>(), {
  view: 'grid',
});

const emit = defineEmits<{
  start: [id: string];
  resume: [id: string];
  stop: [id: string];
  restart: [id: string];
  remove: [id: string, removeImage: boolean];
  pull: [data: PullRequest];
  schedules: [targetType: string, targetId: string];
  security: [containerId: string];
  'edit-compose': [project: string];
}>();

const isActionInProgress = computed(() => !!props.actionInProgress);

const actionStatusText = computed(() => {
  switch (props.actionInProgress) {
    case 'start': return '启动中...';
    case 'resume': return '恢复中...';
    case 'stop': return '停止中...';
    case 'restart': return '重启中...';
    case 'remove': return '删除中...';
    default: return '';
  }
});

// Autostart toggle
async function handleToggleAutostart() {
  await dockerStore.toggleAutostart(props.container.name, !props.container.autostart);
}

const confirmAction = ref<'stop' | 'restart' | 'remove' | 'force-update' | 'recreate' | null>(null);
const showDelayModal = ref(false);

// Folder picker: the menu-driven twin of drag and drop, through the same store
// action. An empty value means "no folder".
const folderStore = useFolderStore();
const showFolderPicker = ref(false);
const currentFolder = computed(() => folderStore.getFolderForContainer(props.container.name));
const folderVerb = computed(() => (currentFolder.value ? '移动' : '添加'));
const folderTargets = computed(() => {
  const targets = folderStore.sortedFolders
    .filter((f) => f.id !== currentFolder.value?.id)
    .map((f) => ({ value: String(f.id), label: f.name }));
  if (currentFolder.value) {
    targets.push({ value: '', label: '无文件夹' });
  }
  return targets;
});

async function handleFolderPicked(value: string) {
  showFolderPicker.value = false;
  await folderStore.moveContainerToFolder(value === '' ? null : Number(value), props.container.id, props.container.name);
}

// Handing a CLI-created container to Unraid's container manager. The modal opens
// straight away and fills in when the field set lands, so the click has a
// visible result even on a slow inspect.
const adoptOpen = ref(false);
const adoptData = ref<AdoptFields | null>(null);
const adoptError = ref<string | null>(null);

async function openAdopt() {
  adoptData.value = null;
  adoptError.value = null;
  adoptOpen.value = true;
  try {
    const { ok, error: failure, data } = await useBackend().containers.adoptFields(props.container.name);
    if (!ok) throw new Error(failure);
    if (data.error) throw new Error(data.message || 'Failed to read the container');
    adoptData.value = data as AdoptFields;
  } catch (e) {
    adoptError.value = e instanceof Error ? e.message : 'Failed to read the container';
  }
}

/**
 * Hand off to Unraid. This navigates the whole Unraid page, so the modal is
 * closed first — coming back to a stale open modal would be worse than losing it.
 */
function runAdopt(dryRun: boolean) {
  const data = adoptData.value;
  if (!data) return;
  adoptOpen.value = false;
  submitAdopt(data, dryRun);
}

async function handleDelayConfirm(value: string) {
  const delay = Math.max(0, parseInt(value) || 0);
  await dockerStore.toggleAutostart(props.container.name, true, delay);
  showDelayModal.value = false;
}

const confirmModalConfig = computed(() => {
  switch (confirmAction.value) {
    case 'stop':
      return { title: '停止容器', message: `停止 "${props.container.name}"？`, label: '停止', variant: 'danger' as const };
    case 'restart':
      return { title: '重启容器', message: `重启 "${props.container.name}"？`, label: '重启', variant: 'default' as const };
    case 'remove':
      return { title: '移除容器', message: `移除 "${props.container.name}"？此操作无法撤销。`, label: '移除', variant: 'danger' as const };
    case 'force-update':
      return { title: '强制更新', message: `拉取 "${props.container.image}" 并重建 "${props.container.name}"，即使没有可用更新？`, label: '强制更新', variant: 'default' as const };
    case 'recreate':
      return { title: '应用更新', message: `重建 "${props.container.name}" 以运行已拉取的 "${props.container.image}" 镜像？重启会保留旧镜像。`, label: '重建', variant: 'default' as const };
    default:
      return { title: '', message: '', label: '', variant: 'default' as const };
  }
});

function pullPayload(force = false): PullRequest {
  const { image, name, managed, id } = props.container;
  return force ? { image, name, managed, id, force } : { image, name, managed, id };
}

/** Apply the image already on disk: recreate, with no pull. */
function recreatePayload(): PullRequest {
  const { image, name, managed, id } = props.container;
  return { image, name, managed, id, recreateOnly: true };
}

function handleConfirm(removeImageToo: boolean) {
  const action = confirmAction.value;
  confirmAction.value = null;
  if (action === 'stop') emit('stop', props.container.id);
  else if (action === 'restart') emit('restart', props.container.id);
  else if (action === 'remove') emit('remove', props.container.id, removeImageToo);
  else if (action === 'force-update') emit('pull', pullPayload(true));
  // No pull: the newer image is already on disk. Pulling again would fail for
  // an image built locally.
  else if (action === 'recreate') emit('pull', recreatePayload());
}

const expanded = ref(false);
const settingsStore = useSettingsStore();
const updatesStore = useUpdatesStore();
const securityStore = useSecurityStore();

// Height transition on the accordion. The details are only mounted while open,
// so this rides Vue's enter/leave rather than a CSS class toggle — the element
// and its content appear and disappear together, with no half-rendered frame.
// After the enter settles the height is cleared back to auto, so content that
// grows later (streaming logs) is not pinned to a stale measurement.
const EXPAND_DURATION = 200;
function expandEnter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = '0';
  htmlEl.style.transition = `height ${EXPAND_DURATION}ms ease`;
  // Reading offsetHeight forces a synchronous reflow so the browser commits
  // the starting height before the transition target is set. Without it the
  // two writes coalesce and the animation never runs.
  // oxlint-disable-next-line no-unused-expressions
  htmlEl.offsetHeight;
  htmlEl.style.height = htmlEl.scrollHeight + 'px';
  setTimeout(done, EXPAND_DURATION);
}
function expandAfterEnter(el: Element) {
  (el as HTMLElement).style.height = '';
  (el as HTMLElement).style.transition = '';
}
function expandLeave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = htmlEl.scrollHeight + 'px';
  htmlEl.style.transition = `height ${EXPAND_DURATION}ms ease`;
  // Same forced reflow as expandEnter — commit the measured height before
  // collapsing to 0, or the element just snaps shut.
  // oxlint-disable-next-line no-unused-expressions
  htmlEl.offsetHeight;
  htmlEl.style.height = '0';
  setTimeout(done, EXPAND_DURATION);
}
function expandAfterLeave(el: Element) {
  (el as HTMLElement).style.height = '';
  (el as HTMLElement).style.transition = '';
}

const isRunning = computed(() => props.container.state === 'running');
const isPaused = computed(() => props.container.state === 'paused');
const isStopped = computed(() => !isRunning.value && !isPaused.value);

const { showStats, containerStats } = useContainerStats({
  containerId: () => props.container.id,
  isRunning,
  expanded,
});

const portConflict = computed(() => dockerStore.getPortConflict(props.container.id));
const hasPortConflict = computed(() => !!portConflict.value);
const portConflictTitle = computed(() =>
  portConflict.value
    ? portConflict.value.conflicts
        .map((d) => `端口 ${d.hostPort}/${d.type} 已被 ${d.heldBy.join('、')} 占用`)
        .join('；')
    : ''
);

// Risky settings on this container. The store returns nothing for a stopped
// one, so the badge and the panel share that rule rather than each spelling it.
const securityFindings = computed(() => securityStore.findings(props.container));
const securityBadgeClass = computed(() =>
  securityFindings.value.some((f) => f.severity === 'critical')
    ? 'bg-error/15 text-error'
    : 'bg-warning/20 text-warning',
);
const securityTitle = computed(() =>
  securityFindings.value.map((f) => f.title).join('; '),
);
const securityAriaLabel = computed(() => {
  const n = securityFindings.value.length;
  return `${n} 项安全发现，位于 ${props.container.name}`;
});

const hasUpdate = computed(() => settingsStore.enableUpdateChecks && updatesStore.hasUpdate(props.container.image));

/**
 * A newer image for the container's tag is on disk, but the container still
 * runs the old one. A pull with no recreate leaves it like this, and the
 * update check no longer reports it, so this is the only sign left.
 */
const needsRecreate = computed(() => !hasUpdate.value && !!props.container.imageOutdated);
// The kebab item that starts the check closes with the menu, so the running
// state needs a home on the card itself.
const checkingUpdates = computed(
  () => settingsStore.enableUpdateChecks && updatesStore.isTargetedCheck(props.container.image),
);
const releaseNotesUrl = computed<string | null>(() =>
  releaseIndexUrl(updatesStore.updates[props.container.image]),
);

// Inline logs panel, shown in both grid and list view. Ownership stays here rather than in
// ContainerDetails: that child is mid-leave-transition during a collapse and
// stops receiving prop updates, so it cannot tell when to stop polling.
const logLines = ref<string[]>([]);
const newLineCount = ref(0);
const logsLoading = ref(false);
// Why Docker wouldn't serve the logs, when it says so. Distinct from an empty
// logLines, which just means the container hasn't logged anything.
const logError = ref('');
const logRefreshTimer = ref<ReturnType<typeof setInterval> | null>(null);
// GraphQL mode pushes new lines instead of polling. The pane keeps at most
// this many, newest first; polling shows the last INLINE_LOG_TAIL.
const MAX_STREAMED_LOG_LINES = 200;
const INLINE_LOG_TAIL = 50;
// After a log stream ends while the pane is still open, poll for this long
// before opening a new stream.
const LOG_STREAM_RETRY_MS = 15000;
let closeLogStream: (() => void) | null = null;
let logStreamRetryTimer: ReturnType<typeof setTimeout> | undefined;

// A stopped container's logs no longer change, and they are the first place to
// look for why it stopped, so its pane always shows, once, with a longer tail.
// The setting only decides whether a running container streams or polls.
// Unlike isRunning, this also counts a container whose process exited while
// Docker still lists it as running: its logs end with the crash too. The card's
// other controls keep isRunning, so that container can still be stopped. A
// restarting container stays live: each attempt writes new output.
const STOPPED_LOG_LINES = 200;
const logsLive = computed(
  () => isRunningContainer(props.container) || props.container.state === 'restarting',
);
// Each fetch takes a number, and only the latest one may write the pane, so a
// 50-line poll sent before a stop cannot land after the 200-line fetch.
let logFetchSeq = 0;

const shouldShowInlineLogs = computed(
  () => expanded.value && (!logsLive.value || settingsStore.showInlineLogs),
);

// Both view branches render the same details; only the padding differs.
const detailsProps = computed(() => ({
  container: props.container,
  containerStats: containerStats.value,
  showStats: showStats.value,
  isRunning: isRunning.value,
  imageLink: imageLink.value,
  showLogs: shouldShowInlineLogs.value,
  logLines: logLines.value,
  logError: logError.value,
  logsLoading: logsLoading.value,
  newLineCount: newLineCount.value,
}));

async function fetchLogs() {
  const seq = ++logFetchSeq;
  logsLoading.value = true;
  try {
    const tail = logsLive.value ? INLINE_LOG_TAIL : STOPPED_LOG_LINES;
    const { ok, data } = await useBackend().containers.logs(props.container.name, tail);
    if (seq !== logFetchSeq) return;
    if (ok) {
      const raw = data.logs || '';
      const prevFirst = logLines.value[0] || '';
      const lines = raw ? raw.split('\n') : [];

      // Determine how many lines at the top are new (logs are newest-first)
      if (prevFirst && lines.length > 0) {
        const prevIdx = lines.indexOf(prevFirst);
        newLineCount.value = prevIdx > 0 ? prevIdx : 0;
      } else {
        newLineCount.value = 0;
      }

      logLines.value = lines;
      // Matches the API's error envelope: `error` is a boolean, the human text
      // is in `message`.
      logError.value = data.error ? data.message || 'Failed to load logs.' : '';
    } else {
      // The backend turns a transport failure into `ok: false` rather than
      // throwing, so this branch covers what the catch below used to.
      logLines.value = [];
      logError.value = 'Failed to load logs.';
      newLineCount.value = 0;
    }
  } catch (e) {
    if (seq !== logFetchSeq) return;
    console.error('Error fetching logs:', e);
    logLines.value = [];
    logError.value = 'Failed to load logs.';
    newLineCount.value = 0;
  } finally {
    if (seq === logFetchSeq) logsLoading.value = false;
  }
}

/**
 * Open a log stream: the first batch replaces the pane like a fetch does, and
 * each later batch is added at the top. If the stream ends while the pane is
 * open (the API restarted, the connection dropped, or the container restarted),
 * poll until a new stream can be opened.
 */
function startLogStream(): boolean {
  const live = useBackend().live;
  if (!live) return false;

  let first = true;
  logsLoading.value = true;
  closeLogStream = live.logs(props.container.name, INLINE_LOG_TAIL, {
    onData: (data) => {
      logsLoading.value = false;
      if (data.error) {
        logLines.value = [];
        logError.value = data.message || 'Failed to load logs.';
        newLineCount.value = 0;
        return;
      }
      const lines = data.logs ? data.logs.split('\n') : [];
      logError.value = '';
      if (first) {
        first = false;
        logLines.value = lines;
        newLineCount.value = 0;
        return;
      }
      logLines.value = [...lines, ...logLines.value].slice(0, MAX_STREAMED_LOG_LINES);
      newLineCount.value = lines.length;
    },
    onEnd: (error) => {
      closeLogStream = null;
      logsLoading.value = false;
      if (!shouldShowInlineLogs.value) return;
      if (error) console.warn('Log stream ended, polling instead:', error);
      startTimedLogPolling();
      logStreamRetryTimer = setTimeout(() => {
        if (shouldShowInlineLogs.value) startLogPolling();
      }, LOG_STREAM_RETRY_MS);
    },
  });
  return true;
}

function startTimedLogPolling() {
  fetchLogs();
  const interval = settingsStore.logRefreshInterval;
  if (interval > 0) {
    logRefreshTimer.value = setInterval(fetchLogs, interval * 1000);
  }
}

/**
 * Start showing logs. A stopped container fetches its last lines once. For a
 * running one, a refresh interval of 0 means the user refreshes by hand, so
 * that fetches once in both modes. Otherwise GraphQL mode streams and PHP mode
 * polls at the interval.
 */
function startLogPolling() {
  stopLogPolling();
  if (!logsLive.value) {
    fetchLogs();
    return;
  }
  if (settingsStore.logRefreshInterval > 0 && startLogStream()) return;
  startTimedLogPolling();
}

function stopLogPolling() {
  if (logRefreshTimer.value !== null) {
    clearInterval(logRefreshTimer.value);
    logRefreshTimer.value = null;
  }
  closeLogStream?.();
  closeLogStream = null;
  clearTimeout(logStreamRetryTimer);
}

/** The refresh button. A stream is reopened, so the pane starts again from a fresh tail. */
function refreshLogs() {
  if (closeLogStream) startLogPolling();
  else fetchLogs();
}

// One watcher for both, so a stop that also opens the pane fetches once. A
// start or stop with the pane open switches between the live tail and the
// one-time stopped tail.
watch([shouldShowInlineLogs, logsLive], ([show]) => {
  if (show) startLogPolling();
  else stopLogPolling();
});

watch(() => settingsStore.logRefreshInterval, (next, prev) => {
  if (!shouldShowInlineLogs.value || !logsLive.value) return;
  // A stream does not use the interval, so a change between two nonzero
  // values leaves it alone.
  if (closeLogStream && next > 0 && prev > 0) return;
  startLogPolling();
});

// State change pulse animation
const stateChangePulse = ref(false);
let pulseTimer: ReturnType<typeof setTimeout> | undefined;

watch(() => props.container.state, () => {
  stateChangePulse.value = true;
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => { stateChangePulse.value = false; }, 600);
});

onUnmounted(() => {
  clearTimeout(pulseTimer);
  stopLogPolling();
});

const distinguishHealthy = inject<Ref<boolean>>('distinguishHealthy', ref(true));
const dragLocked = inject<Ref<boolean>>('dragLocked', ref(false));

// Halo and tooltip resolve together in containerStatus; see utils/containerDisplay.ts.
const status = computed(() => containerStatus(props.container, distinguishHealthy.value));

const editUrl = computed(() => containerEditUrl(props.container));

const resolvedWebui = computed(() => containerWebuiUrl(props.container));

// Same gate as the footer WebUI link, so the two can never disagree about
// whether a container has a reachable web interface.
const iconWebui = computed(() => (isRunning.value ? resolvedWebui.value : null));

/** The compose stack this container belongs to, empty when it has none. */
const composeProject = computed(() => composeProjectOf(props.container) ?? '');

const isCompose = computed(() => !!composeProject.value);

const needsRecreateTitle = computed(() => isCompose.value
  ? '已拉取较新镜像但未运行。请在堆栈文件夹菜单中执行“启动堆栈”或“重建”以应用。'
  : '已拉取较新镜像但未运行。重建容器以应用。');

const isManaged = computed(() => props.container.managed === 'dockerman');

/**
 * Compose containers are excluded on purpose: adopting one detaches it from its
 * stack, and `docker compose up` would then fight Unraid over it.
 *
 * The setting defaults to on, so treat "not loaded yet" as on. Otherwise the
 * action row reflows a moment after the page settles.
 */
const canAdopt = computed(
  () => !isManaged.value && !isCompose.value && (!settingsStore.loaded || settingsStore.enableAdopt),
);

/** Why an Unraid-only action is inert. Three different reasons, three answers. */
const manageHint = computed(() => {
  if (isManaged.value) return undefined;
  if (isCompose.value) {
    return 'Unraid 不管理 Compose 容器，请改为编辑堆栈。';
  }
  if (!canAdopt.value) {
    return '仅适用于 Unraid 管理的容器。请在“设置 › Docker Folders”中开启接管。';
  }
  return '仅适用于 Unraid 管理的容器。请先“纳入 Unraid 管理”。';
});

/**
 * What Edit does, which depends on what defines the container.
 *
 * Unraid edits a container through the XML template it wrote, and a compose
 * container has none, so the entry used to sit there greyed out telling the
 * reader to go and find the stack themselves. The compose file is the template
 * for these, so Edit opens it.
 *
 * Every branch returns the same four keys, because the result is spread into a
 * menu item. A key that only one branch carries reads as an oversight, and
 * sends the reader to KebabMenuRow to find out what an absent one does.
 */
const editEntry = computed(() => {
  // An Unraid template wins when there is one, the same order `manageHint`
  // uses. Adoption refuses compose containers, so a container holding both a
  // template and a stack label is not something the plugin can produce, and
  // this is not the place to guess which one a stray one meant.
  if (editUrl.value) {
    return { href: editUrl.value, action: '', disabled: false, title: manageHint.value };
  }
  if (composeProject.value) {
    return {
      href: '',
      action: 'edit-compose',
      disabled: false,
      title: `Opens the compose file for ${composeProject.value}, which is what defines this container.`,
    };
  }
  return { href: '', action: '', disabled: true, title: manageHint.value };
});

const supportUrl = computed(() => {
  return props.container.labels?.['net.unraid.docker.support'] || null;
});

const projectUrl = computed(() => {
  return props.container.labels?.['net.unraid.docker.project'] || null;
});

const onMobileList = computed(() => props.view === 'list' && isMobile.value);

/**
 * The container kebab: a pending-update alert at the top level, then four
 * submenus in alphabetical order. Actions work on the container, Autostart
 * sets whether and when it starts on boot, Links open other pages, and Options
 * change where it lives and runs from. A submenu with nothing to show hides
 * itself (KebabMenu).
 */
const menuItems = computed<KebabMenuItem[]>(() => [
  { label: '应用更新', icon: DOWNLOAD_ICON, action: 'update', class: 'text-warning', show: hasUpdate.value },
  { label: '应用更新', icon: DOWNLOAD_ICON, action: 'recreate', class: 'text-warning', show: needsRecreate.value && !isCompose.value },
  { divider: true },
  { label: '操作', icon: PLAY_ICON, children: actionMenuItems.value },
  { label: '自动启动', icon: AUTOSTART_ICON, children: autostartMenuItems.value },
  { label: '链接', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', children: linkMenuItems.value },
  { label: '选项', icon: GEAR_ICON, children: optionMenuItems.value },
]);

/**
 * Things that act on the container, including editing it.
 * The start/stop entries only show on a phone in list view, where the row
 * hides its action buttons. Remove stays last under its own divider, wherever
 * the rest sorts to.
 */
const actionMenuItems = computed<KebabMenuItem[]>(() => [
  ...byLabel([
    { label: '启动', icon: 'M6 4l14 8-14 8z', action: 'start', class: 'text-success', show: onMobileList.value && isStopped.value },
    { label: '恢复', icon: 'M6 4l14 8-14 8z', action: 'resume', class: 'text-success', show: onMobileList.value && isPaused.value },
    { label: '重启', icon: 'M1 4v6h6|M3.51 15a9 9 0 1 0 2.13-9.36L1 10', action: 'restart', class: 'text-primary', show: onMobileList.value && isRunning.value },
    { label: '停止', icon: 'M6 6h12v12H6z', action: 'stop', class: 'text-error', show: onMobileList.value && isRunning.value },
    { label: '强制更新', icon: DOWNLOAD_ICON, action: 'force-update', class: 'text-warning', show: !hasUpdate.value && !isCompose.value },
    // Shown before settings land so the menu doesn't grow an entry a moment
    // after it opens; disabled until we know update checks are actually on.
    { label: updatesStore.isCheckingImage(props.container.image) ? '正在检查更新…' : '检查更新', icon: REFRESH_ICON, action: 'check-updates', show: !settingsStore.loaded || settingsStore.enableUpdateChecks, disabled: !settingsStore.loaded, title: settingsStore.loaded ? undefined : '正在加载设置…' },
    { label: '控制台', icon: 'M4 17l6-5-6-5|M12 19h8', action: 'console', show: isRunning.value && !isCompose.value },
    { label: '日志', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8', action: 'logs', show: !isCompose.value },
    // `href` is empty for an unmanaged container, so KebabMenu falls through to
    // its button branch, which is the only one that honours disabled/title.
    // A compose container takes that branch on purpose: Unraid has no template
    // to open for it, and the file that actually defines it is the stack's.
    // Same label either way, so the entry keeps its place in the sorted list.
    { label: '编辑', icon: EDIT_ICON, ...editEntry.value },
  ]),
  { divider: true },
  { label: '移除', icon: TRASH_ICON, action: 'remove', class: 'text-error', show: onMobileList.value && isStopped.value },
]);

/** Whether the container starts with the array, and how long it waits. */
const autostartMenuItems = computed<KebabMenuItem[]>(() => [
  { label: props.container.autostart ? '禁用自动启动' : '启用自动启动', icon: AUTOSTART_ICON, action: 'toggle-autostart', class: props.container.autostart ? 'text-success' : '', disabled: !isManaged.value, title: manageHint.value },
  { label: `自动启动延迟：${props.container.autostartDelay ?? 0} 秒`, icon: STOPWATCH_ICON, action: 'set-autostart-delay', show: !isManaged.value || props.container.autostart, disabled: !isManaged.value, title: manageHint.value },
]);

/** Where the container lives and runs from: adoption, schedules, folder. */
const optionMenuItems = computed<KebabMenuItem[]>(() => byLabel([
  { label: '纳入 Unraid 管理', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12', action: 'adopt', show: canAdopt.value },
  { label: '计划任务', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 6v6l4 2', action: 'schedules' },
  { label: `安全发现 (${securityFindings.value.length})`, icon: SHIELD_ICON, action: 'security', show: securityFindings.value.length > 0 },
  { label: `${folderVerb.value} 到文件夹…`, icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z|M12 11v6|M9 14h6', action: 'pick-folder', show: folderTargets.value.length > 0 },
]));

/** Pages outside this plugin. */
const linkMenuItems = computed<KebabMenuItem[]>(() => byLabel([
  { label: 'Web 界面', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z', href: resolvedWebui.value || '', target: '_blank', show: !!resolvedWebui.value && isRunning.value },
  { label: '项目', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', href: projectUrl.value || imageLink.value || '', target: '_blank', show: !!(projectUrl.value || imageLink.value) },
  { label: '支持', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', href: supportUrl.value || '', target: '_blank', show: !!supportUrl.value },
]));

async function handleMenuAction(action: string) {
  if (action === 'stop') {
    confirmAction.value = 'stop';
  } else if (action === 'start') {
    emit('start', props.container.id);
  } else if (action === 'resume') {
    emit('resume', props.container.id);
  } else if (action === 'restart') {
    confirmAction.value = 'restart';
  } else if (action === 'remove') {
    confirmAction.value = 'remove';
  } else if (action === 'update') {
    emit('pull', pullPayload());
  } else if (action === 'force-update') {
    confirmAction.value = 'force-update';
  } else if (action === 'recreate') {
    confirmAction.value = 'recreate';
  } else if (action === 'check-updates') {
    if (!updatesStore.isCheckingImage(props.container.image)) {
      await updatesStore.checkImagesForUpdates([props.container.image]);
    }
  } else if (action === 'toggle-autostart') {
    handleToggleAutostart();
  } else if (action === 'adopt') {
    void openAdopt();
  } else if (action === 'set-autostart-delay') {
    showDelayModal.value = true;
  } else if (action === 'schedules') {
    emit('schedules', 'container', props.container.name);
  } else if (action === 'security') {
    emit('security', props.container.id);
  } else if (action === 'edit-compose') {
    emit('edit-compose', composeProject.value);
  } else if (action === 'pick-folder') {
    showFolderPicker.value = true;
  } else if (action === 'console') {
    openContainerTerminal(props.container.name, 'console');
  } else if (action === 'logs') {
    openContainerTerminal(props.container.name, 'logs');
  }
}

const imageLink = computed(() => imageRegistryUrl(props.container.image));

const compactPorts = computed(() => {
  const ports = props.container.ports;
  if (!ports?.length) return '';
  return ports
    .filter((p) => p.PublicPort)
    .slice(0, 3)
    .map((p) => String(p.PublicPort))
    .join(', ');
});

</script>
