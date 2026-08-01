/**
 * Registry các module có thể bảo trì độc lập.
 * `block` = danh sách entry-point CỦA KHÁCH bị chặn khi module bảo trì.
 * KHÔNG chặn thao tác vận hành của nhân viên (bếp cập nhật đơn, sửa menu...).
 * Nếu muốn chặn cả pr&fix (kể cả nhân viên) thì để pattern rộng.
 */
export interface BlockRule {
  methods: string[] | '*'; // '*' = mọi method
  path: RegExp;
}

export interface ModuleDef {
  key: string;
  label: string;
  /** Prefix trang FE (để hiện màn bảo trì cục bộ). */
  fePrefixes: string[];
  /** Chỉ chặn các request khớp rule dưới đây (customer-facing). */
  block: BlockRule[];
}

export const MODULES: ModuleDef[] = [
  {
    key: 'ordering',
    label: 'Gọi món (khách)',
    fePrefixes: ['/menu'],
    // CHỈ chặn tạo đơn mới của khách. KHÔNG đụng PATCH /orders/:id/status (nhân viên) hay /dishes CRUD.
    block: [{ methods: ['POST'], path: /^\/api\/orders\/?$/ }],
  },
  {
    key: 'reservation',
    label: 'Đặt bàn (khách)',
    fePrefixes: ['/your-reservation'],
    block: [{ methods: ['POST'], path: /^\/api\/reservations\/?$/ }],
  },
  {
    key: 'ai-chat',
    label: 'Trợ lý AI',
    fePrefixes: [],
    block: [{ methods: '*', path: /^\/api\/ai\/(chat|recommendations|query)/ }],
  },
  {
    key: 'social',
    label: 'Mạng xã hội',
    fePrefixes: ['/social'],
    // Social là tính năng của khách → chặn cả prefix
    block: [{ methods: '*', path: /^\/api\/social/ }],
  },
  {
    key: 'loyalty',
    label: 'Điểm & Voucher',
    fePrefixes: ['/vouchers'],
    block: [{ methods: '*', path: /^\/api\/vouchers/ }],
  },
];

/** Tìm module mà (method, path) của request thuộc về (nếu có). */
export function matchModule(method: string, path: string): ModuleDef | null {
  const m = method.toUpperCase();
  for (const mod of MODULES) {
    for (const rule of mod.block) {
      const methodOk = rule.methods === '*' || rule.methods.includes(m);
      if (methodOk && rule.path.test(path)) return mod;
    }
  }
  return null;
}
