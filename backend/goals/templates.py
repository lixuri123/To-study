from .schemas import GoalStructureInput

TEMPLATE_METADATA = [{
    "key": "full-time-postgraduate-quality",
    "title": "完成研究生综合素质要求",
    "description": "全日制研究生：核心素质 4 类各至少 1 次且总计至少 8 次；素质提升至少覆盖 3 类且总计至少 3 次。",
}]

CORE = {
    "理想信念": ["新生引航工程系列活动", "爱国主义教育", "主题党、团日活动", "青年大学习"],
    "科学道德": ["研究生科学道德与学风建设主题教育", "学术论坛系列讲座"],
    "爱校荣校": ["“知校史、明校情、铸校魂”校园行", "导学文化建设活动", "学校成就展参观活动"],
    "安全法纪": ["入学教育", "日常安全教育"],
}

QUALITY = {
    "学术科创": ["研究生创新创业展", "挑战杯校内赛等双创赛事", "科技创新沙龙", "研究生学科竞赛"],
    "生涯规划": ["研究生就业指导讲座、沙龙", "模拟面试大赛等实践活动"],
    "强身健体": ["研究生体育竞技赛事", "群众性体育活动"],
    "心理健康": ["心理健康节系列活动"],
    "文化艺术": ["艺馨杯文艺汇演", "研究生迎新、毕业晚会", "五月鲜花合唱比赛", "高雅艺术进校园活动", "歌手大赛"],
    "志愿服务": ["“志愿北京”平台累计志愿服务满 10 小时"],
    "社会实践": ["假期社会实践专项", "研究生挂职锻炼", "大学生实习“扬帆计划”", "考核合格的助教助管工作"],
    "理论精进": ["研究生党员骨干培训班", "研究生宣讲团", "鸿雁讲堂累计参加 3 场及以上"],
}


def _categories(mapping, required):
    return [
        {
            "name": name,
            "minimum_amount": 1,
            "is_required": required,
            "position": category_position,
            "suggestions": [
                {"title": title, "position": suggestion_position}
                for suggestion_position, title in enumerate(suggestions)
            ],
        }
        for category_position, (name, suggestions) in enumerate(mapping.items())
    ]


def template_structure(key: str) -> GoalStructureInput:
    if key != "full-time-postgraduate-quality":
        raise KeyError(key)
    return GoalStructureInput.model_validate({
        "title": "完成研究生综合素质要求",
        "description": "全日制研究生：核心素质 4 类各至少 1 次且总计至少 8 次；素质提升至少覆盖 3 类且总计至少 3 次。",
        "blocks": [
            {
                "kind": "quota",
                "title": "核心素质",
                "unit_label": "次",
                "minimum_total": 8,
                "minimum_distinct_categories": 4,
                "position": 0,
                "categories": _categories(CORE, True),
            },
            {
                "kind": "quota",
                "title": "素质提升",
                "unit_label": "次",
                "minimum_total": 3,
                "minimum_distinct_categories": 3,
                "position": 1,
                "categories": _categories(QUALITY, False),
            },
        ],
    })
