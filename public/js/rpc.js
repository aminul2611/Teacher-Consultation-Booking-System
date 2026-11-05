const RPC_ENDPOINT = window.CAMPUSCONNECT_RPC_URL || "/rpc";
const TOKEN_KEY = "campusconnect_session_token";

let requestNumber = 1;


export async function rpcCall(method, params = {}) {
    const response = await fetch(RPC_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: requestNumber++,
            method,
            params,
        }),
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("Server did not return a valid JSON response.");
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message || `Server error: ${response.status}`
        );
    }

    if (data.error) {
        throw new Error(data.error.message || "The RPC request failed.");
    }

    return data.result;
}


export async function registerUser(userDetails) {
    return rpcCall("register_user", userDetails);
}


export async function loginUser(email, password) {
    const result = await rpcCall("login", {
        email,
        password,
    });

    if (!result?.token || !result?.user) {
        throw new Error("The server returned incomplete login information.");
    }

    // Keep the login token only for this browser tab session.
    sessionStorage.setItem(TOKEN_KEY, result.token);

    return result.user;
}


export function getSessionToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}


export async function getProfile() {
    const token = getSessionToken();

    if (!token) {
        throw new Error("Please log in first.");
    }

    return rpcCall("get_profile", { token });
}


export async function logoutUser() {
    const token = getSessionToken();

    try {
        if (token) {
            await rpcCall("logout", { token });
        }
    } finally {
        sessionStorage.removeItem(TOKEN_KEY);
    }
}