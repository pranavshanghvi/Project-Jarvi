"""Builds lib/foodTableData.json, the table that supplies calories per gram for everyday foods.

Source: USDA FoodData Central, "Survey Foods (FNDDS)" 2021-2023, public domain.
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip
It is the table US dietitians use to turn "what a person said they ate" into nutrients: about
5,400 foods as eaten (cooked, mixed dishes included), each with values per 100 g and the weight
of its common portions ("1 cup", "1 slice").

usage: python3 scripts/build-food-table.py <path to surveyDownload.json>

Each row: [name, calories, protein g, carbs g, fat g, saturated fat g, fiber g, sugar g,
           sodium mg, cholesterol mg, [[portion, grams], ...]]   (all per 100 g)
"""
import json, os, sys

NUTRIENTS = [1008, 1003, 1005, 1004, 1258, 1079, 2000, 1093, 1253]
SKIP_CATEGORIES = ('baby', 'formula', 'human milk')
MAX_PORTIONS = 5

def main(source):
    foods = json.load(open(source))['SurveyFoods']
    rows = []
    for food in foods:
        category = food['wweiaFoodCategory']['wweiaFoodCategoryDescription'].lower()
        if any(word in category for word in SKIP_CATEGORIES):
            continue
        amounts = {n['nutrient']['id']: n.get('amount') for n in food['foodNutrients']}
        if amounts.get(1008) is None:
            continue
        values = [round(amounts.get(i) or 0, 1) for i in NUTRIENTS]
        portions = []
        for portion in sorted(food.get('foodPortions', []), key=lambda p: p.get('sequenceNumber', 99)):
            name, grams = portion.get('portionDescription', ''), portion.get('gramWeight')
            if not grams or 'not specified' in name.lower() or 'guideline' in name.lower():
                continue
            portions.append([name, round(grams)])
        rows.append([food['description'], *values, portions[:MAX_PORTIONS]])
    rows.sort(key=lambda r: r[0].lower())
    out = os.path.join(os.path.dirname(__file__), '..', 'lib', 'foodTableData.json')
    with open(out, 'w') as f:
        json.dump(rows, f, separators=(',', ':'), ensure_ascii=False)
    print(len(rows), 'foods,', os.path.getsize(out) // 1024, 'KB')

main(sys.argv[1])
