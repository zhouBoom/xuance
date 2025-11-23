import { randomUUID } from "crypto"

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

export const getTaskId = () => {
    return randomUUID()
}