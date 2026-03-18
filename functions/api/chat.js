/**
 * Cloudflare Pages Function: /api/chat
 * 
 * 带有“立体防御系统”的 AI 对话转发函数。
 * 支持：全站每日限额、IP 每日限额、设备 ID 每日限额、每分钟频率限制。
 * 依赖：需要在 Cloudflare Pages 设置中绑定一个名为 LUMI_KV 的 KV Namespace。
 */

const BASE_URL = "https://api.siliconflow.cn/v1";
const MODEL_NAME = "deepseek-ai/DeepSeek-V3.2";

// --- 阈值配置 (您可以根据需要调整) ---
const MAX_DAILY_TOKENS = 2000000;       // 全站每日总消耗 Token 上限
const MAX_IP_DAILY_TOKENS = 500000;     // 单个 IP 每日消耗 Token 上限
const MAX_DEV_DAILY_TOKENS = 500000;    // 单个设备每日消耗 Token 上限
const MAX_RPM = 10;                     // 每分钟最大请求数 (Requests Per Minute)

export async function onRequestPost(context) {
    const { request, env } = context;
    const kv = env.LUMI_KV;

    // 1. 获取基本信息
    const apiKey = env.AI_API_KEY;
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const deviceId = request.headers.get("X-Device-Id") || "no-id";
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const nowMin = Math.floor(Date.now() / 60000); // 当前分钟级时间戳

    if (!apiKey) {
        return errorResponse("AI_API_KEY environment variable is not set.", 500);
    }

    // 2. 检查 KV 绑定是否存在
    if (!kv) {
        // 如果没有绑定 KV，则回退到无限制模式（或者返回错误，取决于您的安全性需求）
        // 这里为了兼容性，我们打印一个警告并继续，但实际线上建议强制绑定
        console.warn("LUMI_KV is not bound. Protection is disabled.");
        return await forwardToAI(context, apiKey);
    }

    // 3. 执行频率和额度检查
    try {
        // A. 每分钟频率检查 (IP + Device 双重校验)
        const rpmIpKey = `rpm_ip_${clientIp}_${nowMin}`;
        const rpmDevKey = `rpm_dev_${deviceId}_${nowMin}`;
        
        const [ipRpm, devRpm] = await Promise.all([
            kv.get(rpmIpKey),
            kv.get(rpmDevKey)
        ]);

        if (parseInt(ipRpm || "0") >= MAX_RPM || parseInt(devRpm || "0") >= MAX_RPM) {
            return errorResponse("你说话太快啦，休息一分钟再来吧~ (Rate Limit)", 429);
        }

        // B. 每日额度检查
        const dailyKey = `usage_daily_${today}`;
        const ipDailyKey = `usage_ip_${clientIp}_${today}`;
        const devDailyKey = `usage_dev_${deviceId}_${today}`;

        const [dailyUsage, ipUsage, devUsage] = await Promise.all([
            kv.get(dailyKey),
            kv.get(ipDailyKey),
            kv.get(devDailyKey)
        ]);

        if (parseInt(dailyUsage || "0") >= MAX_DAILY_TOKENS) {
            return errorResponse("很抱歉，今日全站 AI 额度已用完，明天再见哦。", 429);
        }
        if (parseInt(ipUsage || "0") >= MAX_IP_DAILY_TOKENS || parseInt(devUsage || "0") >= MAX_DEV_DAILY_TOKENS) {
            return errorResponse("你今天的对话次数太多啦，给其他旅行者留一点吧，明天再来哦。", 429);
        }

        // 4. 转发请求并更新计数
        const aiResponse = await forwardToAI(context, apiKey);
        
        // 如果 AI 请求成功，异步更新 KV 中的 Token 消耗和频率计数
        if (aiResponse.status === 200) {
            // 注意：Cloudflare Pages 允许在 Response 返回后继续执行背景任务 (waitUntil)
            const clonedResponse = aiResponse.clone();
            context.waitUntil((async () => {
                try {
                    const data = await clonedResponse.json();
                    const totalTokens = data.usage?.total_tokens || 0;

                    // 更新频率计数 (设置 TTL 为 2 分钟，自动清理)
                    await Promise.all([
                        kv.put(rpmIpKey, (parseInt(ipRpm || "0") + 1).toString(), { expirationTtl: 120 }),
                        kv.put(rpmDevKey, (parseInt(devRpm || "0") + 1).toString(), { expirationTtl: 120 })
                    ]);

                    // 更新每日 Token 消耗 (设置 TTL 为 2 天，自动清理)
                    await Promise.all([
                        kv.put(dailyKey, (parseInt(dailyUsage || "0") + totalTokens).toString(), { expirationTtl: 172800 }),
                        kv.put(ipDailyKey, (parseInt(ipUsage || "0") + totalTokens).toString(), { expirationTtl: 172800 }),
                        kv.put(devDailyKey, (parseInt(devUsage || "0") + totalTokens).toString(), { expirationTtl: 172800 })
                    ]);
                } catch (err) {
                    console.error("Failed to update usage stats:", err);
                }
            })());
        }

        return aiResponse;

    } catch (e) {
        return errorResponse(`Server Error: ${e.message}`, 500);
    }
}

async function forwardToAI(context, apiKey) {
    const { request } = context;
    const body = await request.json();
    
    const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: body.messages,
            stream: false
        })
    });
    
    return response;
}

function errorResponse(message, status) {
    return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}
