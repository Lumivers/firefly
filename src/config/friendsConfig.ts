import type { FriendLink, FriendsPageConfig } from "../types/config";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
export const friendsConfig: FriendLink[] = [
	{
		title: "NeoMelt",
		imgurl: "https://www.neomelt.cloud/head.jpg",
		desc: "Neomelt的个人blog",
		siteurl: "https://www.neomelt.cloud/",
		tags: ["Blog"],
		weight: 1,
		enabled: true,
	},
	{
		title: "晓风",
		imgurl: "akatsuki-kaze.com.cn/images/avatar.jpg",
		desc: "晓风的个人博客",
		siteurl: "akatsuki-kaze.com.cn",
		tags: ["Blog"],
		weight: 2,
		enabled: true,
	}
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
