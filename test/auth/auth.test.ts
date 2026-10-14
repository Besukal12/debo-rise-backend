import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { uploadHelpImage } from "../../src/modules/help/help.upload.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/lib/token.js";
import {
  changePasswordSchema,
  registerSchema,
  updateProfileSchema,
} from "../../src/modules/auth/auth.schema.js";
import { getPrismaMock } from "../setup.js";

vi.mock("../../src/modules/help/help.upload.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/help/help.upload.js")>();
  return {
    ...actual,
    uploadHelpImage: vi.fn().mockResolvedValue(
      "https://images.example.com/avatar.jpg",
    ),
  };
});

const prismaMock = getPrismaMock();
const userId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const profileUser = {
  id: userId,
  email: "student@example.com",
  fullName: "Student Name",
  role: "STUDENT",
  age: 22,
  ageGroup: "ADULT",
  educationLevel: "UNIVERSITY_STUDENT",
  workStatus: "STUDENT_ONLY",
  avatarUrl: null,
  schoolOrOrg: null,
  location: "Addis Ababa",
  language: "EN",
  dailyReminders: true,
  helpNotify: true,
  isPrivate: true,
  trackId: null,
  parentConsent: true,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
};

function profileAuthorization() {
  prismaMock.user.findFirst.mockResolvedValue({
    id: userId,
    role: "STUDENT",
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken(userId)}`;
}

describe("auth token helpers", () => {
  it("creates access and refresh tokens for their intended token use", () => {
    const accessToken = createAccessToken("student-1");
    const refreshToken = createRefreshToken("student-1");

    expect(verifyAccessToken(accessToken).userId).toBe("student-1");
    expect(verifyRefreshToken(refreshToken).userId).toBe("student-1");
    expect(
      verifyRefreshToken(refreshToken).expiresAt.getTime(),
    ).toBeGreaterThan(Date.now());
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it("stores only a digest of refresh tokens", () => {
    const token = createRefreshToken("student-1");
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).toHaveLength(64);
  });
});

describe("auth validation", () => {
  it("requires guardian contact details for minors", () => {
    const input = {
      fullName: "Student Name",
      email: "student@example.com",
      password: "a sufficiently long password",
      age: 16,
    };
    expect(registerSchema.safeParse(input).success).toBe(false);
    expect(
      registerSchema.safeParse({
        ...input,
        guardianName: "Guardian Name",
        guardianEmail: "guardian@example.com",
      }).success,
    ).toBe(true);
  });

  it("does not require or retain guardian details for adults", () => {
    const adult = {
      fullName: "Adult Student",
      email: "adult@example.com",
      password: "a sufficiently long password",
      age: 22,
      guardianName: "",
      guardianEmail: "",
      guardianPhone: "",
    };
    const parsed = registerSchema.safeParse(adult);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.guardianName).toBeUndefined();
      expect(parsed.data.guardianEmail).toBeUndefined();
      expect(parsed.data.guardianPhone).toBeUndefined();
    }
  });

  it("does not allow users to choose their role or submit an oversized password", () => {
    const input = {
      fullName: "Student Name",
      email: "student@example.com",
      password: "a sufficiently long password",
      age: 22,
    };
    expect(registerSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ ...input, password: "x".repeat(73) }).success,
    ).toBe(false);
  });

  it("requires matching, changed passwords", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old-password-1",
        newPassword: "new-password-2",
        confirmPassword: "new-password-2",
      }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "same-password-1",
        newPassword: "same-password-1",
        confirmPassword: "same-password-1",
      }).success,
    ).toBe(false);
  });

  it("validates editable profile fields but rejects protected account fields", () => {
    expect(
      updateProfileSchema.parse({
        fullName: "  New Student  ",
        schoolOrOrg: "",
        language: "AM",
      }),
    ).toEqual({
      fullName: "New Student",
      schoolOrOrg: null,
      language: "AM",
    });
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({
        role: "ADMIN",
        parentConsent: true,
      }).success,
    ).toBe(false);
  });
});

describe("auth HTTP routes", () => {
  it("returns structured validation errors for invalid registration", async () => {
    const response = await request(app).post("/api/auth/register").send({});
    expect(response.status).toBe(400);
    expect(response.body.type).toBe("BadRequest");
    expect(response.body.details).toBeInstanceOf(Array);
  });

  it("requires a bearer token for the current-user endpoint", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("updates only the authenticated user's editable profile fields", async () => {
    prismaMock.user.update.mockResolvedValue({
      ...profileUser,
      fullName: "New Student",
      schoolOrOrg: null,
      language: "AM",
    });

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", profileAuthorization())
      .send({
        fullName: "New Student",
        schoolOrOrg: "",
        language: "AM",
      });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: userId,
      fullName: "New Student",
      schoolOrOrg: null,
      language: "AM",
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: {
          fullName: "New Student",
          schoolOrOrg: null,
          language: "AM",
        },
      }),
    );
  });

  it("rejects protected profile fields without updating the user", async () => {
    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", profileAuthorization())
      .send({ role: "ADMIN" });

    expect(response.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("uploads and stores the authenticated user's avatar", async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    prismaMock.user.update.mockResolvedValue({
      ...profileUser,
      avatarUrl: "https://images.example.com/avatar.jpg",
    });
    vi.mocked(uploadHelpImage).mockResolvedValue(
      "https://images.example.com/avatar.jpg",
    );

    const response = await request(app)
      .put("/api/auth/me/avatar")
      .set("Authorization", profileAuthorization())
      .set("Content-Type", "image/jpg")
      .send(image);

    expect(response.status).toBe(200);
    expect(response.body.user.avatarUrl).toBe(
      "https://images.example.com/avatar.jpg",
    );
    expect(uploadHelpImage).toHaveBeenCalledWith(
      image,
      "image/jpeg",
      `debo-rise/avatars/${userId}`,
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: { avatarUrl: "https://images.example.com/avatar.jpg" },
      }),
    );
  });

  it("rejects untrusted browser origins", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({ email: "student@example.com", password: "password" });
    expect(response.status).toBe(403);
  });
});
