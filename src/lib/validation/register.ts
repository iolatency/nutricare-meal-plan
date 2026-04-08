export function validatePasswordIssues(password: string): string[] {
	const issues: string[] = [];
	if (password.length < 8) issues.push('8 أحرف على الأقل');
	if (!/[A-Z]/.test(password)) issues.push('حرف كبير واحد على الأقل');
	if (!/[a-z]/.test(password)) issues.push('حرف صغير واحد على الأقل');
	if (!/\d/.test(password)) issues.push('رقم واحد على الأقل');
	return issues;
}

export function passwordIssuesToMessage(issues: string[]): string {
	if (issues.length === 0) return '';
	return 'كلمة المرور يجب أن تحتوي على: ' + issues.join('، ');
}

export function validateUsername(username: string): string | null {
	const trimmed = username.trim();
	if (!trimmed) return 'اسم المستخدم مطلوب';
	if (/\s/.test(trimmed)) return 'اسم المستخدم لا يمكن أن يحتوي على مسافات';
	if (trimmed.length < 4) return 'اسم المستخدم يجب أن يكون 4 أحرف على الأقل';
	if (!/^[a-zA-Z0-9._]+$/.test(trimmed)) {
		return 'اسم المستخدم يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام ونقاط وشرطات سفلية';
	}
	return null;
}
