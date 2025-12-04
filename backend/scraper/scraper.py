import requests
from bs4 import BeautifulSoup

url = "https://class-schedule.app.utah.edu/main/1264/class_list.html?subject=MATH"
response = requests.get(url)

# Always check if the request was successful
if response.status_code == 200:
    print("Page fetched successfully!")
    with open("math_course_page.html", "w", encoding="utf-8") as f:
        f.write(response.text)

else:
    print("Error:", response.status_code)



