/**
 * Security advisor rules.
 *
 * Pure functions over fields the container list already carries, so the whole
 * rule set is testable without a store, a fetch, or a Docker socket. Nothing
 * here talks to Unraid: every finding tells the user what to change in Unraid's
 * own Docker edit form, and the plugin never touches the container.
 *
 * Findings are for running containers only (the caller decides), but port
 * occupancy is built from every container — a stopped one still owns its
 * binding and takes the port back the moment it starts.
 */

import type { Container, ContainerMount } from '@/stores/docker';

/**
 * Every finding type, as the one runtime list the union is derived from.
 *
 * `SecurityAdvisor::FINDING_TYPES` in the backend repeats these strings as its
 * write-side allowlist, because PHP and TypeScript share no source. Add a type
 * to both, or a dismissal of the new type comes back as a 400.
 */
export const FINDING_TYPES = [
  'privileged',
  'docker-socket',
  'host-network',
  'added-capabilities',
  'broad-mount',
  'forced-root',
  'shared-mount-group',
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

export type Severity = 'critical' | 'warning';

/**
 * One row of the remove/add table: the setting as it stands now, what to put in
 * its place, and why. Either side can be empty. A port mapping is an addition
 * with nothing to remove, and a capability the application never needed is a
 * removal with nothing to add.
 *
 * The note is separate from both so it renders as prose. A paragraph of
 * monospace explanation reads like command output, not like guidance.
 *
 * The panel hangs a note on a cell as an info icon, so each note names the cell
 * it belongs to rather than leaving the panel to work it out. The side is not
 * cosmetic: "Covers every share on the array" beside /mnt/user/<share> reads as
 * a complaint about the suggestion, when it describes the mount that is there
 * today. A row with no cells at all, such as "And 3 more exposed ports", uses
 * the plain `note`, which renders as its own line.
 *
 * A row must not carry cells and a plain `note` together. The panel renders one
 * or the other, so the note would vanish. A test walks every rule to hold that.
 */
export interface FindingDetail {
  /** The current setting, as Unraid or `docker run` spells it. */
  remove?: string;
  /** What to put in its place. */
  add?: string;
  /** One line on why the detected setting is a problem. */
  removeNote?: string;
  /** One line on why this replacement, for this row only. */
  addNote?: string;
  /** A summary line standing on its own, for a row with neither cell. */
  note?: string;
}

export interface SecurityFinding {
  type: FindingType;
  severity: Severity;
  /** Short label, used in the badge tooltip and as the modal row heading. */
  title: string;
  /** One sentence on what the setting actually grants. */
  why: string;
  /** What to change, written for Unraid's Docker edit form. */
  fix: string;
  /** The offending mounts, capabilities, or suggested port mappings. */
  detail?: FindingDetail[];
  /** Docker's own documentation for the setting. */
  docs: string;
}

/**
 * A finding as a rule states it. The documentation link is left off because it
 * follows from the type, and `findingsFor` stamps it on: six builders each
 * picking their own DOCS key by hand is six chances to paste the wrong one.
 */
type FindingRule = Omit<SecurityFinding, 'docs'>;

/**
 * Where each setting is documented. Every anchor here was checked against the
 * live page: the `docker container run` reference anchors only some options, so
 * `--cap-add` and `--user` point at pages that cover the subject properly
 * rather than at an anchor that silently lands at the top.
 */
export const DOCS: Record<FindingType, string> = {
  privileged: 'https://docs.docker.com/reference/cli/docker/container/run/#privileged',
  'docker-socket': 'https://docs.docker.com/engine/security/#docker-daemon-attack-surface',
  'host-network': 'https://docs.docker.com/engine/network/drivers/host/',
  'added-capabilities': 'https://docs.docker.com/engine/security/#linux-kernel-capabilities',
  'broad-mount': 'https://docs.docker.com/engine/storage/bind-mounts/',
  'forced-root': 'https://docs.docker.com/engine/security/userns-remap/',
  // Not a Docker page. PUID and PGID are a linuxserver.io convention, and this
  // page is the one that explains what they do to the ownership of files in a
  // shared volume. The modal derives its link label from the host.
  'shared-mount-group': 'https://docs.linuxserver.io/general/understanding-puid-and-pgid/',
};

/** Host port -> name of a container that binds it. */
export type PortOwners = Map<number, string>;

export const DOCKER_SOCKET = '/var/run/docker.sock';

/**
 * Writable bind mounts of these host paths hand a container the whole array,
 * the flash drive, or the host's own configuration. Matched exactly: a mount of
 * /mnt/user/appdata/sonarr is normal and must not be flagged.
 */
export const BROAD_PATHS = ['/', '/boot', '/etc', '/var/run', '/mnt', '/mnt/user'];

/** Broad paths where a writable mount is bad enough to call critical. */
const CRITICAL_PATHS = ['/', '/boot'];

/**
 * What to do about each broad path. A narrower Host Path comes first, because
 * it is the change that actually reduces what the container can reach.
 * Read-only access is the fallback for a container that has to see the wider
 * tree. The paths that no container should mount say to remove the mount
 * instead of offering a narrower spelling of the same thing.
 */
interface MountAdvice {
  /** A narrower Host Path to suggest. Absent means the mount should just go. */
  path?: string;
  note: string;
}

/**
 * /mnt and /mnt/user get the same answer, because both are the array and the
 * fix for both is to name one share. The share is deliberately a placeholder:
 * which one this container wants is only knowable from the destination and the
 * application, so guessing it would put a wrong path in a column the user
 * pastes from.
 */
const SHARE_ADVICE: MountAdvice = {
  path: '/mnt/user/<share>',
  note: '涵盖阵列上的每一个共享文件夹。请指定该应用实际使用的那一个。',
};

const BROAD_PATH_ADVICE: Record<string, MountAdvice> = {
  '/': { note: '涵盖整个服务器。请改为挂载该应用实际使用的文件夹。' },
  '/boot': {
    note: '这是保存服务器配置的闪存盘。在此处写入可能导致服务器无法启动。',
  },
  '/etc': { note: '服务器的配置文件。请指定它读取的那一个文件，或移除该挂载。' },
  '/var/run': {
    note: '服务器的套接字，包括 Docker 套接字。请指定它需要的那一个，或移除该挂载。',
  },
  '/mnt': SHARE_ADVICE,
  '/mnt/user': SHARE_ADVICE,
};

/**
 * Capabilities that are close enough to privileged mode to rank with it.
 * SYS_ADMIN alone is enough to mount filesystems and escape most containers.
 */
export const HIGH_RISK_CAPS = ['SYS_ADMIN', 'SYS_MODULE', 'ALL'];

/** Suggested port mappings printed before the list is summarized. */
export const MAX_SUGGESTED_PORTS = 4;

/**
 * The uid half of a Docker user string, with `root` resolved to the number it
 * always is. The forced-root test and `effectiveUser` both need that one rule,
 * and two spellings of it are two things to keep in step.
 */
function uidOf(user: string): string {
  const [uid] = String(user ?? '').trim().split(':');
  return uid?.toLowerCase() === 'root' ? '0' : (uid ?? '');
}

/** Whether a Docker user string names root, in any of its spellings. */
function namesRoot(user: string): boolean {
  return uidOf(user) === '0';
}

/**
 * Whether somebody pinned the container to root, rather than the image asking
 * for it.
 *
 * An empty user is the normal case and says nothing: the image picks the user,
 * and images from linuxserver.io, along with official ones such as postgres and
 * nginx, all start as root and drop privileges at entrypoint.
 *
 * A value is not enough on its own. Docker copies the image's own USER into the
 * container's Config.User, so a container built from an image that declares
 * USER 0 reports uid 0 with nothing overriding anything. grafana/mimir ships
 * exactly that, and every container from it read as forced-root. Two inspects
 * of the same container, one with --user and one without, are otherwise
 * identical, so the image is the only thing left to compare against.
 *
 * `imageUser` empty means the image declares no user, so any root value beside
 * it came from outside the image. That is the case this finding is for.
 */
export function isForcedRoot(user: string, imageUser = ''): boolean {
  return namesRoot(user) && !namesRoot(imageUser);
}

/**
 * Whether `child` sits inside `parent`, or is `parent`.
 *
 * Anchored on a trailing separator. A plain `startsWith` is the containment bug
 * CLAUDE.md calls out on the PHP side: without the separator,
 * `/mnt/user/media-old` reads as inside `/mnt/user/media`.
 */
export function pathIsWithin(child: string, parent: string): boolean {
  if (!child || !parent) return false;
  if (child === parent) return true;
  const base = parent.endsWith('/') ? parent : `${parent}/`;
  return child.startsWith(base);
}

/** Whether two mounts reach the same files, in either direction. */
export function pathsOverlap(a: string, b: string): boolean {
  return pathIsWithin(a, b) || pathIsWithin(b, a);
}

/** A resolved container identity. `field` names the setting that produced it. */
export interface EffectiveUser {
  uid: string;
  gid: string | null;
  field: 'user' | 'puid';
}

const numeric = (value: string) => /^\d+$/.test(value);

/**
 * Who the container's files end up belonging to, or null when it does not say.
 *
 * `Config.User` wins when it is set, because Docker applies it directly. Almost
 * nothing sets it, so PUID and PGID carry the answer on Unraid: images from
 * linuxserver.io start as root and drop to them at entrypoint.
 *
 * A user *name* resolves to null. Only the host's passwd file maps it to a
 * number, and comparing a name against a number would invent a mismatch that
 * may not exist. `root` is the exception, because it is always 0.
 */
export function effectiveUser(container: Container): EffectiveUser | null {
  const configured = String(container.user ?? '').trim();
  if (configured) {
    const [, rawGid] = configured.split(':');
    const uid = uidOf(configured);
    if (!uid || !numeric(uid)) return null;
    return { uid, gid: rawGid && numeric(rawGid) ? rawGid : null, field: 'user' };
  }

  const puid = String(container.puid ?? '').trim();
  if (!numeric(puid)) return null;
  const pgid = String(container.pgid ?? '').trim();
  return { uid: puid, gid: numeric(pgid) ? pgid : null, field: 'puid' };
}

/** How a resolved identity reads in the panel. */
export function describeUser(user: EffectiveUser): string {
  if (user.field === 'user') {
    return user.gid ? `--user=${user.uid}:${user.gid}` : `--user=${user.uid}`;
  }
  return user.gid ? `PUID ${user.uid}, PGID ${user.gid}` : `PUID ${user.uid}`;
}

/**
 * The umask every process starts with unless something changes it, and what a
 * linuxserver.io image uses when the template sets no UMASK.
 */
export const DEFAULT_UMASK = 0o022;

/** Read an octal umask string such as "022" or "0002". Null if it is not one. */
export function parseUmask(value: string): number | null {
  const raw = String(value ?? '').trim();
  if (!/^[0-7]{1,4}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 8);
  return parsed <= 0o777 ? parsed : null;
}

/** Three-digit octal, the way a person writes a umask. */
export function describeUmask(umask: number): string {
  return umask.toString(8).padStart(3, '0');
}

/**
 * Split Docker's "8989/tcp" exposed-port form. Returns null for anything that
 * does not carry a positive port number.
 */
export function parseExposedPort(spec: string): { port: number; proto: string } | null {
  const [portPart, protoPart] = String(spec).split('/');
  const port = Number.parseInt(portPart, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { port, proto: protoPart || 'tcp' };
}

/**
 * Pick a host port to suggest for a container port.
 *
 * Returns the container port itself when no other container holds it, else the
 * next free port above it plus the name of the container holding the original.
 * `self` is the container being advised: a host-network container holds its own
 * exposed ports, and telling it that it conflicts with itself is nonsense.
 *
 * Ports the Unraid host itself holds (webgui, SSH, SMB) are invisible here,
 * which is why callers say "no other container is using X" and never "X is
 * free".
 */
export function suggestHostPort(
  exposed: number,
  bound: PortOwners,
  self = '',
): { port: number; takenBy: string | null } {
  const heldBy = (port: number) => {
    const owner = bound.get(port);
    return owner === undefined || owner === self ? null : owner;
  };

  const takenBy = heldBy(exposed);
  if (takenBy === null) return { port: exposed, takenBy: null };

  let candidate = exposed + 1;
  while (candidate < 65536 && heldBy(candidate) !== null) candidate++;
  return { port: candidate, takenBy };
}

/**
 * What to do about a given capability instead of just deleting the flag.
 *
 * Only ALL has a replacement, because naming one capability in place of every
 * capability is a real narrowing. Every other row leaves the right column
 * empty on purpose. `--cap-drop=ALL --cap-add=<the same capability>` looks like
 * hardening and is not: it keeps the dangerous capability and removes Docker's
 * fourteen defaults, which images from linuxserver.io need to drop from root to
 * PUID and PGID at startup. The container breaks and gains nothing.
 */
interface CapAdvice {
  /** What replaces the flag. Absent means the flag simply goes. */
  add?: string;
  note: string;
}

const CAP_ADVICE: Record<string, CapAdvice> = {
  ALL: {
    add: '--cap-add=<capability>',
    note: 'ALL 授予所有能力，等同于另一种形式的特权模式。请指定应用文档中列出的那一两个能力。',
  },
  SYS_ADMIN: {
    // No replacement. SYS_ADMIN is the capability that gets a process out of
    // the container, so nothing smaller stands in for it, and no device does
    // either: on Unraid a container mounts as real root, so a FUSE tool needs
    // the capability as well as /dev/fuse.
    note: 'SYS_ADMIN 涵盖了特权模式的大部分功能，且没有更窄的替代方案。如果容器确实挂载了 FUSE 文件系统（例如 rclone 或 mergerfs），那么它除了该能力外还需要 --device=/dev/fuse，而真正的解决之道是使用一个不要求这两者的镜像。',
  },
  SYS_MODULE: {
    note: 'SYS_MODULE 允许容器向宿主机内核加载内核模块，这会破坏容器隔离。几乎没有任何应用需要它。',
  },
  NET_ADMIN: {
    note: 'NET_ADMIN 涵盖路由、防火墙规则和接口变更。如果容器运行 VPN 隧道，它还需要 --device=/dev/net/tun。如果它只是发送 ping，NET_RAW 即可满足，且该能力默认已开启。',
  },
  NET_RAW: {
    note: 'NET_RAW 已经在 Docker 的默认集合中，因此添加它不会带来任何变化。',
  },
  SYS_PTRACE: {
    note: 'SYS_PTRACE 允许容器检查其他进程。它适用于调试会话，而不适合一直运行的容器。',
  },
  DAC_READ_SEARCH: {
    note: 'DAC_READ_SEARCH 会跳过文件读取权限检查，因此容器可以读取其通过挂载所能触及的任何文件。应缩小挂载范围。',
  },
};

function capabilityFinding(container: Container, capAdd: string[]): FindingRule {
  const caps = capAdd.map((c) => c.toUpperCase().replace(/^CAP_/, ''));
  const high = caps.filter((c) => HIGH_RISK_CAPS.includes(c));

  const lines = caps.map((c) => {
    const advice = CAP_ADVICE[c];
    return {
      remove: `--cap-add=${c}`,
      // An unknown capability gets no replacement. There is no safer spelling
      // of a capability, so the decision is remove it or accept it.
      add: advice?.add,
      // Every capability note explains the capability that is set, including
      // ALL, which is the only row here that also has a replacement.
      removeNote: advice?.note,
    };
  });

  return {
    type: 'added-capabilities',
    severity: high.length > 0 ? 'critical' : 'warning',
    title: high.length > 0 ? `授予 ${high.join('、')}` : '添加了 Linux 能力',
    why:
      high.length > 0
        ? '这些能力使容器能够挂载文件系统并加载内核模块，这正是逃离容器进入宿主机的途径。'
        : '添加的每一项能力都会解除 Docker 默认施加在容器上的某个限制。',
    // Removal is the whole adjustment. Anything that reads like a safer
    // spelling of the same capability is false comfort.
    fix: `在 Unraid 中编辑 ${container.name}，打开“显示更多设置”，并将该标志从“额外参数”中移除。启动容器并观察日志：模板常常携带应用并不需要的某项能力。如果它确实需要，则保留该标志，相关风险也随之保留。`,
    detail: lines,
  };
}

function socketMountFinding(mount: ContainerMount): FindingRule {
  const readOnly = !mount.RW;
  return {
    type: 'docker-socket',
    severity: 'critical',
    title: '挂载了 Docker 套接字',
    why: '能够访问 Docker 套接字就等于能够访问宿主机：任何能与它通信的对象都可以启动一个特权容器并读取阵列上的每一个文件。',
    fix: readOnly
      ? '如果应用不需要该挂载，请将其移除。只读本身并不能阻止任何操作，因为该套接字通过它用来应答的同一通道接收命令。如果应用确实需要 Docker，请在其前置一个套接字代理，仅暴露它所使用的接口。'
      : '如果应用不需要该挂载，请将其移除。如果需要，请在其前置一个套接字代理，仅暴露它所使用的接口。',
    detail: [
      {
        remove: `${DOCKER_SOCKET} -> ${mount.Destination} (${readOnly ? '只读' : '读写'})`,
        removeNote: readOnly
          ? '只读在此处不起作用，因为该套接字通过它用来应答的同一通道接收命令。'
          : undefined,
      },
    ],
  };
}

function hostNetworkFinding(container: Container, bound: PortOwners): FindingRule {
  const exposed = (container.exposedPorts ?? [])
    .map(parseExposedPort)
    .filter((p): p is { port: number; proto: string } => p !== null)
    .sort((a, b) => a.port - b.port);

  const detail: FindingDetail[] = [
    { remove: '网络类型：host', add: '网络类型：bridge' },
  ];

  if (exposed.length === 0) {
    detail.push({
      note: '该镜像未声明任何端口，因此请为应用监听的端口添加映射，格式为 port:port。',
    });
  } else {
    const ports = exposed.slice(0, MAX_SUGGESTED_PORTS);
    for (const { port, proto } of ports) {
      const { port: hostPort, takenBy } = suggestHostPort(port, bound, container.name);
      detail.push({
        add: `${hostPort}:${port}${proto === 'tcp' ? '' : `/${proto}`}`,
        // This one is about the mapping being offered, not about host
        // networking, so it belongs beside the suggestion.
        addNote:
          takenBy === null
            ? `${hostPort} 没有其他容器在使用。`
            : `${takenBy} 正在使用 ${port}，因此这里上移到 ${hostPort}。`,
      });
    }
    const rest = exposed.length - ports.length;
    if (rest > 0) {
      detail.push({ note: `以及另外 ${rest} 个暴露的端口。` });
    }
  }

  return {
    type: 'host-network',
    severity: 'warning',
    title: '使用主机网络',
    why: '容器共享宿主机网络栈，因此它开放的每个端口在服务器上都可达，并且它能看到本应发往其他容器的流量。',
    fix: `在 Unraid 中编辑 ${container.name} 并更改网络，然后为应用所服务的每个端口添加端口映射。`,
    detail,
  };
}

function broadMountFindings(container: Container): FindingRule[] {
  const offenders = (container.mounts ?? []).filter(
    (m) => m.Type === 'bind' && m.RW && BROAD_PATHS.includes(m.Source),
  );
  if (offenders.length === 0) return [];

  const critical = offenders.some((m) => CRITICAL_PATHS.includes(m.Source));

  return [
    {
      type: 'broad-mount',
      severity: critical ? 'critical' : 'warning',
      title: '可写挂载了宽泛的主机路径',
      why: '主机路径是服务器的顶层目录，因此容器可以修改其下的每一个文件。容器只需要它实际工作所处的最小文件夹。',
      fix: `在 Unraid 中编辑 ${container.name} 并更改卷映射。将主机路径指向应用所需的最小文件夹（例如某个共享文件夹），或将访问模式设置为只读。`,
      detail: offenders.map((m) => {
        const advice = BROAD_PATH_ADVICE[m.Source];
        return {
          remove: `${m.Source} -> ${m.Destination} (读写)`,
          // Only the new Host Path. The container path is not changing, so
          // repeating it on the right makes the reader diff two strings to
          // find the one field that moved.
          add: advice?.path,
          // The note says what the mount reaches today, not what the narrower
          // path would, so it hangs on the detected cell.
          removeNote: advice?.note,
        };
      }),
    },
  ];
}

/**
 * One container's writable bind mount, with the identity behind it.
 *
 * A flat list rather than a map keyed by path, because two mounts can reach the
 * same files without spelling the same string. The caller builds it once over
 * every running container.
 */
export interface MountWriter {
  container: string;
  source: string;
  user: EffectiveUser;
  /** The umask this container creates files with. */
  umask: number;
  /** False when the umask is the assumed default rather than a stated UMASK. */
  umaskStated: boolean;
}

/** Shared folders printed before the list is summarized. */
export const MAX_SHARED_PATHS = 4;

/**
 * Every writable bind mount of a container, paired with who writes it.
 *
 * A broad path is left out. A container holding /mnt/user contains every other
 * container's folders, so it would pair with all of them and bury the specific
 * conflicts under a list of coincidences. That mount has its own finding, and
 * narrowing it, which is what that finding asks for, settles this one too.
 */
export function mountWritersFor(container: Container): MountWriter[] {
  const user = effectiveUser(container);
  if (!user) return [];

  const stated = parseUmask(String(container.umask ?? ''));

  return (container.mounts ?? [])
    .filter((m) => m.Type === 'bind' && m.RW && !BROAD_PATHS.includes(m.Source))
    .map((m) => ({
      container: container.name,
      source: m.Source,
      user,
      umask: stated ?? DEFAULT_UMASK,
      umaskStated: stated !== null,
    }));
}

/** Which permission bit keeps the other container out. */
export type BlockReason = 'group' | 'other';

/**
 * Why `other` cannot write a file `creator` makes, or null when it can.
 *
 * A new file gets mode 0666 with the creator's umask taken out of it, so the
 * umask is what decides whether the user and group actually keep anyone out:
 *
 *   umask 022 -> 0644, so neither the group nor anyone else can write
 *   umask 002 -> 0664, so the group can write
 *   umask 000 -> 0666, so anyone can write
 *
 * Null also covers "cannot tell". A container that states no group could be in
 * the same one, and guessing would invent a problem.
 */
export function blockedBy(creator: MountWriter, other: MountWriter): BlockReason | null {
  // Same user, so the owner bits apply and they are always writable.
  if (creator.user.uid === other.user.uid) return null;

  const mine = creator.user.gid;
  const theirs = other.user.gid;
  if (mine === null || theirs === null) return null;

  if (mine === theirs) return (creator.umask & 0o020) !== 0 ? 'group' : null;
  return (creator.umask & 0o002) !== 0 ? 'other' : null;
}

/**
 * One folder two or more containers write, where one cannot use the other's
 * files.
 *
 * Keyed by folder rather than by container on purpose: the same clash read from
 * each container in turn says the same thing twice, mirrored.
 */
export interface FolderConflict {
  /** The folder they share, which is the deeper of the overlapping mounts. */
  path: string;
  /** Everyone writing it, the blocked containers included. */
  writers: MountWriter[];
  /** The container whose files the others cannot write. */
  creator: MountWriter;
  reason: BlockReason;
}

/** Every folder clash on the box, worst path first for a stable order. */
export function folderConflicts(writers: MountWriter[]): FolderConflict[] {
  const byPath = new Map<string, FolderConflict>();

  for (let i = 0; i < writers.length; i++) {
    for (let j = i + 1; j < writers.length; j++) {
      const a = writers[i];
      const b = writers[j];
      if (a.container === b.container) continue;
      if (!pathsOverlap(a.source, b.source)) continue;

      // Each direction is governed by the umask of whoever creates the file.
      const aBlocks = blockedBy(a, b);
      const reason = aBlocks ?? blockedBy(b, a);
      if (!reason) continue;

      // The deeper mount is the folder they genuinely share: the other reaches
      // it through a parent.
      const path = a.source.length >= b.source.length ? a.source : b.source;
      const existing = byPath.get(path);

      if (existing) {
        for (const w of [a, b]) {
          if (!existing.writers.some((x) => x.container === w.container)) {
            existing.writers.push(w);
          }
        }
        continue;
      }

      byPath.set(path, { path, writers: [a, b], creator: aBlocks ? a : b, reason });
    }
  }

  return [...byPath.values()].sort((x, y) => x.path.localeCompare(y.path));
}

/** The identity line shown beside a container in the folder list. */
export function describeWriter(writer: MountWriter): string {
  const umask = `umask ${describeUmask(writer.umask)}`;
  return `${describeUser(writer.user)}, ${writer.umaskStated ? umask : `${umask}（默认假定）`}`;
}

/**
 * One sentence saying who cannot change what, and nothing about how to settle
 * it. Which identity a folder should belong to depends on every other folder
 * those containers touch, which the plugin cannot see, so naming a PUID, a
 * PGID, or a umask here would send a share of users the wrong way. The finding
 * reports the effect and leaves the choice with the user.
 */
export function conflictReason(conflict: FolderConflict): string {
  const { creator, reason } = conflict;
  const others = conflict.writers.filter((w) => w.container !== creator.container);
  const names = others.map((w) => w.container).join(', ');

  if (reason === 'group') {
    return (
      `${creator.container} 与 ${names} 同属组 ${creator.user.gid}，但 ${creator.container} ` +
      `以 umask ${describeUmask(creator.umask)} 创建文件，导致这些文件对该组` +
      '其余成员只读。'
    );
  }

  return (
    `${creator.container} 以 ${describeUser(creator.user)} 的身份写入，而 ${names} 属于不同的` +
    `组，因此 ${creator.container} 创建的文件其他容器无法写入。`
  );
}

function sharedMountFindings(container: Container, conflicts: FolderConflict[]): FindingRule[] {
  const mine = conflicts.filter((c) => c.writers.some((w) => w.container === container.name));
  if (mine.length === 0) return [];

  const shown = mine.slice(0, MAX_SHARED_PATHS);

  // Note-only rows. The other findings name a setting and its replacement, but
  // this one has no replacement to name, and the modal's empty-right-cell
  // wording ("removal") would read as advice to drop the mount.
  const detail: FindingDetail[] = shown.map((conflict) => {
    const own = conflict.writers.find((w) => w.container === container.name)!;
    return {
      note: `${conflict.path}，写入身份为 ${describeWriter(own)}。${conflictReason(conflict)}`,
    };
  });

  const rest = mine.length - shown.length;
  if (rest > 0) {
    detail.push({ note: `以及另外 ${rest} 个共享文件夹。` });
  }

  const onlyUmask = mine.every((c) => c.reason === 'group');

  return [
    {
      type: 'shared-mount-group',
      severity: 'warning',
      title: onlyUmask
        ? '写入了其他容器无法修改的共享文件夹'
        : '与处于不同组的容器共享文件夹',
      why: onlyUmask
        ? '另一个容器也在写入同一个文件夹。在那里创建的文件对该组其余成员来说都是只读的，因此其他容器无法移动或修改它们。'
        : '两个容器以不同的组写入同一个文件夹。Unraid 的共享文件夹按组归属，因此一个容器创建的文件，另一个容器无法修改。',
      fix: '这些容器中的某一个可能无法读取或更改另一个在此文件夹中写入的内容。该文件夹应归属于哪个身份，取决于这些容器所写入的所有其他内容，因此插件不会替你做选择。',
      detail,
    },
  ];
}

/**
 * Every finding for one container, worst first. Dismissals are applied by the
 * caller, not here, so this stays a pure function of the container.
 */
export function findingsFor(
  container: Container,
  bound: PortOwners,
  writers: MountWriter[] = [],
): SecurityFinding[] {
  const findings: FindingRule[] = [];

  if (container.privileged) {
    findings.push({
      type: 'privileged',
      severity: 'critical',
      title: '以特权模式运行',
      why: '特权容器拥有全部 Linux 能力以及访问宿主机设备的权限，因此容器内部一旦被攻破，就等于服务器被攻破。',
      fix: `在 Unraid 中编辑 ${container.name} 并打开“显示更多设置”。仅当应用文档明确要求某项能力时，再将其添加回来。`,
      detail: [
        {
          remove: '特权模式：开',
          add: '特权模式：关',
        },
        {
          add: '--cap-add=<capability>',
          // Not --cap-drop=ALL alongside it. Turning privileged off already
          // returns the container to Docker's fourteen defaults, and those
          // defaults are what an image needs to drop from root to PUID at
          // startup.
          addNote:
            '仅当应用文档明确要求时。将其放入“额外参数”中。大多数容器在此处不需要任何设置。',
        },
      ],
    });
  }

  const socket = (container.mounts ?? []).find(
    (m) => m.Type === 'bind' && m.Source === DOCKER_SOCKET,
  );
  if (socket) findings.push(socketMountFinding(socket));

  if ((container.capAdd ?? []).length > 0) {
    findings.push(capabilityFinding(container, container.capAdd));
  }

  if (isForcedRoot(container.user, container.imageUser)) {
    findings.push({
      type: 'forced-root',
      severity: 'warning',
      title: '被强制以 root 运行',
      why: '模板将容器固定为 uid 0，因此即使镜像本应降级到 PUID 和 PGID，应用仍会在容器内保持完整的 root 权限。',
      fix: `在 Unraid 中编辑 ${container.name}，打开“显示更多设置”，并从“额外参数”中清除该标志。`,
      detail: [
        {
          remove: `--user=${container.user}`,
          removeNote:
            '大多数镜像会自行选择正确的用户，而 linuxserver.io 的镜像则改用 PUID 和 PGID，因此通常无需回填任何内容。',
        },
      ],
    });
  }

  if (container.networkMode === 'host') {
    // Built last of the critical set on purpose: the suggestion reads better
    // after the reader knows what else is wrong.
    findings.push(hostNetworkFinding(container, bound));
  }

  findings.push(...broadMountFindings(container));
  findings.push(...sharedMountFindings(container, folderConflicts(writers)));

  return findings
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((f) => ({ ...f, docs: DOCS[f.type] }));
}

export function severityRank(severity: Severity): number {
  return severity === 'critical' ? 0 : 1;
}
