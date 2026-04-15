import { h } from "hastscript";
import { visit } from "unist-util-visit";
import mermaidRenderScript from "./mermaid-render-script.js?raw";

/**
 * 递归提取 HAST 节点树中的所有文本内容
 */
function extractText(node) {
	if (node.type === "text") return node.value || "";
	if (node.children) return node.children.map(extractText).join("");
	return "";
}

export function rehypeMermaid() {
	return (tree) => {
		// 标记：每页只注入一次渲染脚本，避免重复内联 ~16KB 的 JS
		let scriptInjected = false;

		visit(tree, "element", (node) => {
			if (
				node.tagName === "div" &&
				node.properties &&
				node.properties.className &&
				node.properties.className.includes("mermaid-container")
			) {
				// 优先使用 data-mermaid-code 属性，为空时从子节点文本提取（MDX 兼容）
				let mermaidCode = node.properties["data-mermaid-code"] || "";
				if (!mermaidCode) {
					mermaidCode = extractText(node).trim();
				}
				const mermaidId = `mermaid-${Math.random().toString(36).slice(-6)}`;

				// 创建 Mermaid 容器
				const mermaidContainer = h(
					"div",
					{
						class: "mermaid-wrapper",
						id: mermaidId,
					},
					[
						h(
							"div",
							{
								class: "mermaid",
								"data-mermaid-code": mermaidCode,
							},
							mermaidCode,
						),
					],
				);

				// 替换原始节点
				node.tagName = "div";
				node.properties = { class: "mermaid-diagram-container" };

				// 只在第一个 Mermaid 块注入渲染脚本，后续的只保留容器
				if (!scriptInjected) {
					const renderScript = h(
						"script",
						{
							type: "text/javascript",
						},
						mermaidRenderScript,
					);
					node.children = [mermaidContainer, renderScript];
					scriptInjected = true;
				} else {
					node.children = [mermaidContainer];
				}
			}
		});
	};
}
