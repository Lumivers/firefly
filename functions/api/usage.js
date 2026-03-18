/**
 * Cloudflare Pages Function: /api/usage
 * 
 * 查询 SiliconFlow 的账户余额。
 * 需要在 Cloudflare 环境变量中设置 AI_API_KEY。
 */

export async function onRequestGet(context) {
    const { env } = context;
    const apiKey = env.AI_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: "AI_API_KEY not set" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const response = await fetch("https://api.siliconflow.cn/v1/user/info", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Response(await response.text(), { status: response.status });
        }

        const data = await response.json();
        
        // 只返回必要的余额信息，保护隐私
        return new Response(JSON.stringify({
            status: "success",
            data: {
                name: data.data.name,
                totalBalance: data.data.totalBalance,
                balance: data.data.balance,
                chargeBalance: data.data.chargeBalance,
                freezeBalance: data.data.freezeBalance
            }
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
