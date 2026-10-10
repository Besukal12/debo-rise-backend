import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
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
} from "../../src/modules/auth/auth.schema.js";

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

  it("rejects untrusted browser origins", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({ email: "student@example.com", password: "password" });
    expect(response.status).toBe(403);
  });
});
