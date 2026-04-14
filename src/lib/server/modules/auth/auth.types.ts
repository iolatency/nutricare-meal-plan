export type SessionUser = {
	id: number;
	name: string;
	email: string;
	role: 'dietitian' | 'patient';
	/** Ignored for dietitians; patients need a dietitian activation before using the app. */
	canAccessPatientApp: boolean;
};
