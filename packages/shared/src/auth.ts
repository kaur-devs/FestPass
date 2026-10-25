import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.').max(254, 'Email address is too long.'));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

const tokenSchema = z.string().min(1, 'This link is invalid.').max(200, 'This link is invalid.');

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters.'),
  email: emailSchema,
  password: newPasswordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: newPasswordSchema,
});

export const verifyEmailSchema = z.object({
  token: tokenSchema,
});

export type SignUpInput = z.input<typeof signUpSchema>;
export type SignInInput = z.input<typeof signInSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.input<typeof verifyEmailSchema>;

export type SignUpData = z.output<typeof signUpSchema>;
export type SignInData = z.output<typeof signInSchema>;

export type PlatformRole = 'USER' | 'ADMIN';
export type OrganizationRole = 'OWNER' | 'ORGANIZER';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  emailVerified: boolean;
  hasPassword: boolean;
  organizations: { id: string; name: string; slug: string; role: OrganizationRole }[];
  volunteering: { eventId: string; eventTitle: string; gate: string | null }[];
}
