---
title: "第五章 PBR 深入：BRDF、IBL 与材质工作流"
published: 2026-04-29
pinned: false
description: "**图形学进阶 · PBR 深入。** 从 Cook-Torrance BRDF 的三个核心项（法线分布D/几何遮蔽G/菲涅尔F）到 IBL 的漫反射与镜面反射实现，从 Metallic/Roughness 工作流到底层的数学直觉——Ch3 讲了 PBR 是什么，本章讲它的数学是怎么运作的。"
tags: [图形学, PBR, BRDF, IBL, Cook-Torrance, 材质, Shader]
category: 图形学笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第五章 PBR 深入：BRDF、IBL 与材质工作流

> **一句话理解**：Ch3 讲了 PBR 的"是什么"——金属度/粗糙度替代经验参数。本章讲"为什么"——Cook-Torrance BRDF 的 D/F/G 三项各自对应什么物理现象，IBL 怎么用一张环境贴图照亮整个场景，以及为什么这套数学能保证能量守恒。

> 📋 前置知识：Ch3（PBR 概念——金属度/粗糙度/能量守恒的直觉）、算法 Ch1（向量/点积/叉积）

---

## 5.1 渲染方程——PBR 的根公式

### 一句话

```
渲染方程 (Rendering Equation)：

出射光 = 自发光 + ∫(入射光 × BRDF × 余弦项) dω

  L_o(p, ω_o) = L_e(p, ω_o) + ∫_Ω f_r(p, ω_i, ω_o) × L_i(p, ω_i) × (n·ω_i) dω_i

简化理解：
  一个表面点在某个方向上看起来有多亮 =
    它自己发的光（自发光——通常为 0）
    + 所有入射光 × BRDF（反射多少、向哪反射）× 余弦项（斜射进来的光能量弱）
    在整个半球上的积分
```

**不需要背这个公式**。但需要理解：

```
BRDF f_r(p, ω_i, ω_o) 是整个 PBR 的核心——
它描述了：一束光从方向 ω_i 射入，有多少比例被反射到方向 ω_o

不同的材质 = 不同的 BRDF
PBR 的 BRDF = Cook-Torrance 模型
```

---

## 5.2 Cook-Torrance BRDF

### 宏观 vs 微观

```
宏观表面：我们看到的物体形状——一个大平面
微观表面：显微镜下——由无数微小镜面组成

粗糙度 = 0 → 所有微表面朝向一致（宏观表面的法线方向）→ 镜面反射
粗糙度 = 1 → 微表面朝向随机分布 → 光向所有方向散射 → 漫反射

PBR 的 BRDF 基于微表面理论——每个微表面是一个完美的镜面，
但它们的法线方向分布决定了整体的反射行为。
```

### Cook-Torrance 公式

```
Cook-Torrance BRDF = 漫反射项 + 镜面反射项

f_r = k_d × f_lambert + k_s × f_cooktorrance

其中：
  k_d = (1 - metallic) × (1 - F)  —— 金属度越高漫反射越弱
  k_s = 1 - k_d                    —— 能量守恒：漫反射+镜面反射 = 1

镜面反射项（Cook-Torrance）：
  f_cooktorrance = (D × G × F) / (4 × (n·l) × (n·v))

  D (Normal Distribution Function)：法线分布函数
    "多少微表面的法线正好在 H 方向上？"

  G (Geometry Function)：几何遮蔽函数
    "这些微表面中，有多少没有被别的微表面挡住？"

  F (Fresnel)：菲涅尔函数
    "在这个角度上，有多少光被反射（vs 折射/吸收）？"

  / (4 × (n·l) × (n·v))：归一化因子——从微表面模型推导出的
```

---

## 5.3 D —— 法线分布函数

### 作用

```
D 回答：半角向量 H 方向上，有多少微表面的法线指向 H？

半角向量 H = normalize(L + V)
为什么要看 H？因为只有法线 = H 的微表面，才能把 L 方向的光反射到 V 方向。

粗糙度低 → 大量微表面法线集中在宏观法线附近 → D 值在 N 处很高 → 小而亮的高光
粗糙度高 → 微表面法线分散 → D 值在整个半球分布 → 大而暗的高光
```

### GGX（Trowbridge-Reitz）分布

```hlsl
// GGX —— 目前最常用的法线分布函数
float D_GGX(float NdotH, float roughness) {
    float a = roughness * roughness;           // Disney 重映射——更线性的粗糙度感知
    float a2 = a * a;
    float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// roughness 的效果：
// 0.1：D 值在 NdotH≈1 处很高，很快衰减 → 小而亮的高光
// 0.5：D 值中等 → 中等大小的高光
// 1.0：D 值分布均匀 → 整个半球都有 → 像漫反射
```

**为什么要用 roughness²（Disney 重映射）？**

```
直接传 roughness，美术调到 0.5 发现高光还是很小——
因为 GGX 的 roughness 响应不是线性的。

Disney 把 roughness 平方：让美术感知的 0.5 对应 roughness² = 0.25
→ 高光大小线性响应美术的调参
```

---

## 5.4 G —— 几何遮蔽函数

### 作用

```
G 回答：微表面之间会不会互相遮挡？

两个现象：
  1. 遮蔽 (Shadowing)：入射光被微表面挡住了 → 照不到
  2. 掩蔽 (Masking)：反射光被微表面挡住了 → 看不到

  入射光 ↘  ╱ 反射光
             ╲╱  ← 这个微表面被旁边的挡住了（遮蔽）
         ════╪════
             微表面

粗糙度越高 → G 越小 → 微表面互相遮挡越多 → 反射越暗
粗糙度越低 → G 越接近 1 → 几乎没有遮挡 → 反射越亮
```

### Smith GGX

```hlsl
// Smith 几何遮蔽函数——分别算遮蔽和掩蔽，再乘起来
float G_Smith(float NdotL, float NdotV, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;

    // 遮蔽项（光被挡住）
    float G_L = 2.0 * NdotL / (NdotL + sqrt(a2 + (1.0 - a2) * NdotL * NdotL));

    // 掩蔽项（反射被挡住）
    float G_V = 2.0 * NdotV / (NdotV + sqrt(a2 + (1.0 - a2) * NdotV * NdotV));

    return G_L * G_V;
}

// 性能优化版——把两个项合并
float G_SmithOptimized(float NdotL, float NdotV, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;

    float GGX_L = NdotL + sqrt(a2 + (1.0 - a2) * NdotL * NdotL);
    float GGX_V = NdotV + sqrt(a2 + (1.0 - a2) * NdotV * NdotV);

    return (2.0 * NdotL / GGX_L) * (2.0 * NdotV / GGX_V);
    // 或进一步简化为: 0.5 / (GGX_L * GGX_V)（用 Schlick-GGX 近似）
}
```

**G 项的直观理解**：

```
粗糙度 = 0（镜面）：
  G ≈ 1.0 —— 所有面朝向一致，没有互相遮挡

粗糙度 = 1（粗糙）：
  G 变得显著小于 1 —— 大量微表面互相遮挡
  这解释了为什么粗糙表面看起来更暗——
  不是因为吸收了更多光，而是微表面互相挡住了
```

---

## 5.5 F —— 菲涅尔效应

### 作用

```
F 回答：在某个角度上，有多少光被表面反射？

日常观察：
  站在水边低头看：能看到水底（反射率低，折射率高）
  站在水边远眺：只能看到天空的倒影（反射率高，折射率低）

原因：掠射角（grazing angle）时反射率趋近 100%
     这就是菲涅尔效应——反射率随入射角变化
```

### Schlick 近似

```hlsl
// Schlick 近似——足够准确且计算量小
float3 F_Schlick(float3 F0, float NdotV) {
    return F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
}

// F0：垂直入射（直视表面）时的反射率
//   非金属：F0 ≈ 0.02-0.08（反射率很低——玻璃/水也就 2-5%）
//   金属：F0 = albedo（金属没有漫反射，反射颜色 = albedo）
//
// 渲染时的常见 F0 值：
//   水：0.02   玻璃：0.04   钻石：0.17
//   铁：0.56   金：(1.0, 0.78, 0.34) 铜：(0.95, 0.64, 0.54)

// 在 Shader 中，F0 通过材质参数计算：
float3 F0 = lerp(0.04, albedo, metallic);
// 非金属（metallic=0）：F0 = 0.04（常见非金属的近似值）
// 金属（metallic=1）：F0 = albedo（金属的反射颜色就是其外观颜色）
```

**为什么非金属用 0.04？**

```
大多数非金属（水、石头、木头、皮肤）垂直入射时的反射率在 2-8%。
用 0.04（4%）是一个不错的折中。

例外：
  钻石（0.17）——这就是为什么钻石看起来闪亮
  但游戏里通常不需要特殊处理——0.04 足够了
```

---

## 5.6 完整 PBR Shader

```hlsl
// ============ Cook-Torrance PBR 片元着色器 ============

float4 PBR_PS(VertexOutput input) : SV_TARGET {
    // 1. 采样材质贴图
    float3 albedo = SAMPLE_TEXTURE2D(_AlbedoMap, sampler_Albedo, input.uv).rgb;
    float metallic = SAMPLE_TEXTURE2D(_MetallicMap, sampler_Metallic, input.uv).r;
    float roughness = SAMPLE_TEXTURE2D(_RoughnessMap, sampler_Roughness, input.uv).r;
    float ao = SAMPLE_TEXTURE2D(_AOMap, sampler_AO, input.uv).r;

    // 2. 法线（从法线贴图获取 + TBN 变换——见 Ch3）
    float3 N = GetWorldNormal(input);
    float3 V = normalize(_WorldSpaceCameraPos - input.worldPos);
    float3 L = normalize(_MainLightDirection.xyz);
    float3 H = normalize(L + V);

    // 3. 计算用到的点积
    float NdotL = max(0.0, dot(N, L));
    float NdotV = max(0.001, dot(N, V));  // 避免除零
    float NdotH = max(0.0, dot(N, H));

    // 4. 菲涅尔项
    float3 F0 = lerp(0.04, albedo, metallic);
    float3 F = F_Schlick(F0, NdotV);

    // 5. 法线分布函数
    float D = D_GGX(NdotH, roughness);

    // 6. 几何遮蔽函数
    float G = G_Smith(NdotL, NdotV, roughness);

    // 7. Cook-Torrance 镜面反射项
    float3 specular = (D * G * F) / (4.0 * NdotL * NdotV + 0.001);

    // 8. 漫反射项——金属没有漫反射
    float3 kD = (1.0 - F) * (1.0 - metallic);
    float3 diffuse = kD * albedo / PI;

    // 9. 合成
    float3 Lo = (diffuse + specular) * _MainLightColor.rgb * NdotL;

    // 10. 环境光——用 AO 减弱
    float3 ambient = albedo * _AmbientColor.rgb * ao;

    return float4(Lo + ambient, 1.0);
}
```

---

## 5.7 IBL —— 基于图像的光照

### 为什么需要 IBL

```
前面的 PBR Shader 只算了一个直接光源。环境光用的是常量 _AmbientColor。
但真实环境中，每个方向都有不同的光照：
  - 天空是蓝色的 → 朝上的一面偏蓝
  - 地面是绿色的 → 朝下的一面偏绿
  - 太阳附近特别亮，其他方向较暗

IBL = 用一张环境贴图（HDRI）来模拟来自所有方向的间接光照
```

### IBL 的两部分

```hlsl
// IBL = 漫反射 IBL + 镜面反射 IBL

// ============ 1. 漫反射 IBL ============
// 简单的理解：平均了整张环境贴图的颜色
// 实现：预计算"辐照度图"（Irradiance Map）

// 采样辐照度图——根据法线方向取对应的环境色
float3 irradiance = SAMPLE_TEXTURECUBE(_IrradianceMap, sampler_Irradiance, N).rgb;
float3 diffuseIBL = irradiance * albedo * kD;

// ============ 2. 镜面反射 IBL ============
// R = reflect(-V, N) —— 完美镜面的反射方向
// 但粗糙表面不是镜面——反射方向周围的一大片区域都有贡献
// 需要根据粗糙度模糊环境贴图

// 预计算：生成"预过滤环境贴图"（Prefiltered Environment Map）
//   不同 Mip 级别存不同粗糙度下的模糊版本
//   Mip 0 = 粗糙度 0（镜面——不经模糊）
//   Mip 5 = 粗糙度 1（完全模糊——接近漫反射）

float3 R = reflect(-V, N);
float mipLevel = roughness * MAX_MIP;  // 粗糙度映射到 Mip 级别
float3 prefilteredColor = SAMPLE_TEXTURECUBE_LOD(
    _PrefilteredEnvMap, sampler_Prefiltered, R, mipLevel).rgb;

// BRDF 积分查找表（LUT）：2D 纹理，横轴=NdotV，纵轴=roughness
// 存的是 Cook-Torrance BRDF 在半球上的预积分结果
float2 brdf = SAMPLE_TEXTURE2D(_BrdfLUT, sampler_BrdfLUT,
                                float2(NdotV, roughness)).rg;
float3 specularIBL = prefilteredColor * (F * brdf.x + brdf.y);

// ============ 最终 IBL ============
float3 ambient = (diffuseIBL + specularIBL) * ao;
```

**三张贴图的直观理解**：

```
辐照度图 (Irradiance Map)：
  环境贴图 → 对每个方向平均周围一大片 → 极度模糊
  回答："从法线方向来看，环境大概是什么颜色？"

预过滤环境图 (Prefiltered Env Map)：
  环境贴图 → 对每个方向按不同粗糙度模糊 → 多个 Mip 级别
  回答："从某个方向来的反射，考虑到粗糙度，应该是什么颜色？"

BRDF LUT：
  一张红绿的 2D 贴图
  回答："Cook-Torrance 对半球做积分时，BRDF 的能量补偿因子"
```

---

## 5.8 面试口述

### Q："PBR 的 BRDF 包含哪几项？各自的作用？"

```
"Cook-Torrance BRDF 的核心是镜面反射项，包含三个子项。

D——法线分布函数，描述微表面的法线指向某个方向的概率。
  决定高光的大小——粗糙度越低 D 越集中，高光越小越亮。

G——几何遮蔽函数，描述微表面之间互相遮挡造成的能量损失。
  粗糙度越高 G 越小——这就是为什么粗糙表面更暗，
  不是吸收了光，而是微表面互相挡住了。

F——菲涅尔函数，描述反射率随入射角的变化。
  垂直看非金属反射率只有 2-5%，掠射角看反射率接近 100%。

三项各自独立地描述了一种物理现象，
乘在一起就构成了 Cook-Torrance 镜面反射模型。"
```

### Q："金属度和粗糙度在 PBR 工作流中分别控制什么？"

```
"金属度控制的是材质的物理类型——非金属还是金属。
这个区别在 BRDF 中有三个连锁反应：

第一，F0（垂直入射反射率）——非金属 F0 ≈ 0.04（4%），金属 F0 = albedo。
铜偏红的 albedo 会让 F0 变成偏红色 → 反射带颜色。
非金属的高光永远是白色的（因为光没有进入材质内部，只从表面弹走）。

第二，漫反射——金属没有漫反射（kD = 1 - metallic，控制漫反射的强度）。
金属的所有反射都走镜面反射项，而非金属的漫反射项贡献了大部分颜色。
为什么金属没有漫反射？因为光子在金属表面被自由电子反射，无法穿透表面。

第三，菲涅尔效应——非金属掠射角反射率趋近 100%，金属掠射角反射率也趋近 100%。
但非金属正视时反射率很低（2-5%），金属正视时反射率就等于 albedo。

粗糙度控制的是微表面法线的混乱程度。
粗糙度 = 0 → 所有微表面朝向一致 → 完美镜面 → D 值集中在 N 方向 → 小亮高光。
粗糙度 = 1 → 微表面朝向随机 → G 变小（互相遮挡增多）→ 高光模糊分散 → 变暗。

两者是正交的：金属度决定反射'什么颜色'，粗糙度决定反射'多清晰'。"
```

---

## 5.9 本章回顾

| 概念 | 一句话 |
|------|--------|
| **渲染方程** | 出射光 = ∫(入射光 × BRDF × cosθ) —— PBR 的数学根源 |
| **微表面模型** | 表面由微小镜面组成——粗糙度 = 微表面法线的混乱程度 |
| **D (法线分布)** | 多少微表面朝向半角向量——决定高光大小 |
| **G (几何遮蔽)** | 微表面互相遮挡——决定粗糙表面的变暗 |
| **F (菲涅尔)** | 掠射角反射更强——水面远处比近处反光亮 |
| **F0** | 垂直入射反射率——非金属≈0.04，金属=albedo |
| **IBL 漫反射** | 辐照度图——环境贴图的极度模糊版 |
| **IBL 镜面反射** | 预过滤环境贴图——不同粗糙度对应不同 Mip |

> 📖 下一章：[第六章 前向与延迟渲染](./06_forward_deferred) —— 两种渲染架构的完整对比。PBR 讲了光照怎么算，架构决定了"对哪些像素算"。
