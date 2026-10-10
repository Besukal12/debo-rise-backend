import { NextFunction, Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { hashPassword } from "../../lib/hash.js";
import { registerSchema } from "./auth.schema.js";
import { Prisma } from "../../generated/prisma/client.js";

export async function RegisterUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid registration data",
      errors: result.error.issues.map(({ path, message }) => ({
        field: path.join("."),
        message,
      })),
    });
    return;
  }

  const data = result.data;

  try {
    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        age: data.age,
        ageGroup: data.age < 18 ? "MINOR" : "ADULT",
        role: "STUDENT",
        educationLevel: data.educationLevel,
        workStatus: data.workStatus,
        guardianName: data.guardianName,
        guardianEmail: data.guardianEmail,
        guardianPhone: data.guardianPhone,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        age: true,
        ageGroup: true,
        educationLevel: true,
        workStatus: true,
        guardianName: true,
        guardianEmail: true,
        guardianPhone: true,
        parentConsent: true,
        createdAt: true,
      },
    });

    res.status(201).json({ user });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ message: "An account with this email already exists" });
      return;
    }

    next(error);
  }
}
