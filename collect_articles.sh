#!/bin/bash

# 定义公共变量
BASE_URL="https://test-debug-wechat.100tal.com/bfgateway/bf_dispatcher/SendMessage"
TIMESTAMP=$(date +%s%3N)  # 当前时间戳（毫秒）

# 定义请求参数数组
declare -A requests=(
    # 混沌商学院
    ["4981264323"]="614ae29a000000000201d86e_4981264323|94722452460"
    # 有几十篇文章的账号
    ["95290640546"]="665833de0000000003032103_95290640546|9815250367"
    # 北京大学账号
    ["272273116"]="5a6028274eacab7f2ddf0dc9_272273116|106806249"
)

# 遍历并执行请求
for user_id in "${!requests[@]}"; do
    IFS="|" read -r device_id author_id <<< "${requests[$user_id]}"
    
    echo "正在处理用户 $user_id..."
    
    # 构造请求体
    body='{
        "command": "collect_article",
        "device_id": "'$device_id'",
        "trace_id": "trace_id_100589001002",
        "penetrate": "T1005",
        "timestamp": '$TIMESTAMP',
        "user_id": "'$user_id'",
        "app_type": "2",
        "body": "{\"user_id\": \"'$user_id'\",\"rule_id\": \"KUSALGt98\",\"author_ids\": [\''$author_id'\'],\"keywords\": [\"交流\"],\"target_userid\": \"182741077\",\"target_nickname\": \"柳岩\",\"previous_title\": \"红裙红唇复古大波浪卷发～ 今日份港风～\",\"comment_keywords\": [\"好美\"],\"read_limit\": 2000,\"follow_limit\": 2000,\"end_time\": 1734495132000}"
    }'

    # 执行curl请求
    curl --location "$BASE_URL" \
         --header 'Content-Type: application/json' \
         --data "$body" \
         --silent \
         | jq '.' # 使用jq美化输出JSON

    echo "请求完成: $user_id"
    echo "-------------------"
    
    # 添加间隔，避免请求过于频繁
    sleep 2
done

echo "所有请求已完成" 