import { Buffer } from "node:buffer";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
const passwordFitsBcrypt = (value: string) => Buffer.byteLength(value, "utf8") <= 72;
const passwordSchema = z.string().min(8).max(72).refine(passwordFitsBcrypt, { message: "Password must be at most 72 bytes" });
const suppliedPasswordSchema = z.string().min(1).max(72).refine(passwordFitsBcrypt, { message: "Password must be at most 72 bytes" });
const nameSchema = z.string().trim().min(2).max(100);
const blankToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalNameSchema = z.preprocess(blankToUndefined, z.string().trim().min(2).max(100).optional());
const optionalEmailSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
);
const optionalPhoneSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid phone number").optional(),
);

const educationLevelSchema = z.enum([
  "HIGH_SCHOOL_STUDENT",
  "HIGH_SCHOOL_GRADUATE",
  "UNIVERSITY_STUDENT",
  "UNIVERSITY_GRADUATE",
  "OTHER",
]);

const workStatusSchema = z.enum([
  "STUDENT_ONLY",
  "UNEMPLOYED_SEEKING_WORK",
  "FREELANCER",
  "EMPLOYED",
  "OTHER",
]);

export const registerSchema = z
  .object({
    fullName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    age: z.number().int().min(1).max(120),
    educationLevel: educationLevelSchema.optional(),
    workStatus: workStatusSchema.optional(),
    guardianName: optionalNameSchema,
    guardianEmail: optionalEmailSchema,
    guardianPhone: optionalPhoneSchema,
  })
  .strict()
  .superRefine((data, context) => {
    if (data.age < 18) {
      if (!data.guardianName) {
        context.addIssue({
          code: "custom",
          path: ["guardianName"],
          message: "Guardian name is required for users under 18",
        });
      }

      if (!data.guardianEmail && !data.guardianPhone) {
        context.addIssue({
          code: "custom",
          path: ["guardianEmail"],
          message: "Provide a guardian email address or phone number",
        });
      }
    }
  })
  .transform((data) => data.age >= 18
    ? { ...data, guardianName: undefined, guardianEmail: undefined, guardianPhone: undefined }
    : data);

export const loginSchema = z
  .object({
    email: emailSchema,
    password: suppliedPasswordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: suppliedPasswordSchema,
    newPassword: passwordSchema,
    confirmPassword: suppliedPasswordSchema,
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20).max(512),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1).max(128),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
