export type User = { id: string; fullName: string; email: string };
export type Org = { id: string; name: string; slug?: string; role: string };
export type Session = { user: User; organization: Org; accessToken: string };
