export async function copyText(value: string): Promise<boolean> {
	if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
		return false;
	}
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}
