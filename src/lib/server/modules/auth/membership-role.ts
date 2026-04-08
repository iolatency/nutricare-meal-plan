export type AppRole = 'dietitian' | 'patient';

export function membershipRolesToAppRole(rolesText: string | null | undefined): AppRole {
	if (!rolesText) return 'patient';
	const lower = rolesText.toLowerCase();
	if (lower.includes('patient') || lower.includes('client')) {
		return 'patient';
	}
	if (
		lower.includes('dietitian') ||
		lower.includes('admin') ||
		lower.includes('owner') ||
		lower.includes('staff')
	) {
		return 'dietitian';
	}
	return 'patient';
}
