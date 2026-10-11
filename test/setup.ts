import { afterEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    track: { findUnique: vi.fn() },
    module: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

export function getPrismaMock() {
  return mockState.prisma;
}

vi.mock("../src/config/prisma.js", () => ({ prisma: mockState.prisma }));

afterEach(() => {
  vi.clearAllMocks();
});