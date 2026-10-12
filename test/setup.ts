import { afterEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    track: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    module: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    lesson: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userLessonProgress: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    helpRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    helpReply: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    trackMeeting: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    attendanceRecord: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
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