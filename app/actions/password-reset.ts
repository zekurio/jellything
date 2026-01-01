"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { forgotPassword, forgotPasswordPin, getUserById, authenticateUser } from "@/server/jellyfin/admin";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { createSession, sessionCookieConfig } from "@/server/session";
import { success, error, type ActionResult } from "@/app/actions/types";
import { passwordResetRequestSchema, passwordResetCompleteSchema } from "@/lib/schemas";

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult<null>> {
	const parsed = passwordResetRequestSchema.safeParse(input);
	if (!parsed.success) {
		return error(parsed.error.issues[0]?.message || "Validation failed");
	}

	if (!isEmailConfigured()) {
		return success(null);
	}

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, parsed.data.email.toLowerCase()));

	if (!user || !user.emailVerified || !user.email) {
		return success(null);
	}

	try {
		const jellyfinUser = await getUserById(user.jellyfinUserId);
		const result = await forgotPassword(jellyfinUser.name);

		if (result.action !== "PinCode" || !result.pinFile) {
			console.error("Unexpected forgot password response:", result);
			return error("Password reset not available for this user");
		}

		const pinData = JSON.parse(result.pinFile);
		const pin = pinData.Pin;

		await sendEmail({
			to: user.email,
			subject: "Your Jellyfin Password Reset PIN",
			html: `<p>Your PIN is: <strong>${pin}</strong></p><p>This PIN expires at ${new Date(result.pinExpirationDate ?? "").toLocaleString()}</p>`,
		});
	} catch (emailError) {
		console.error("Failed to send password reset email:", emailError);
	}

	return success(null);
}

export async function completePasswordReset(input: {
	username: string;
	pin: string;
	newPassword: string;
}): Promise<ActionResult<null>> {
	const parsed = passwordResetCompleteSchema.safeParse(input);
	if (!parsed.success) {
		return error(parsed.error.issues[0]?.message || "Validation failed");
	}

	const { username, pin, newPassword } = parsed.data;
	const cleanPin = pin.replace(/-/g, "").toUpperCase();

	try {
		await forgotPasswordPin(cleanPin);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const authResult = await authenticateUser(username, newPassword);

		const sessionId = await createSession(
			authResult.id,
			authResult.isAdmin,
			authResult.accessToken,
		);

		const cookieStore = await cookies();
		cookieStore.set("session", sessionId, sessionCookieConfig);
	} catch (err) {
		console.error("Failed to reset password:", err);
		return error(err instanceof Error ? err.message : "Failed to reset password");
	}

	revalidatePath("/");

	return success(null);
}
