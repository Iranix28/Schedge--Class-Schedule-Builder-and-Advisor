from app.database.query_routers.departments_query import *
from app.database.query_routers.courses_query import *
from app.database.query_routers.course_prerequisites_query import *
from app.database.query_routers.class_sections_query import *
from app.database.session import SessionLocal
from datetime import datetime

db = SessionLocal()

# Startup display
def display_menu():
    print("1. Add a class")
    print("2. View current schedule")
    print("3. Save & exit")
    print("4. Remove a class")

# get the class details
def add_class(schedule):
    # class_id = map(int, input("Enter classId (i.e <469>): ").split())
    class_id = int(input("Enter course id (i.e 469) "))
    # name = input("Enter class name: ").strip()
    # days = input("Enter day (Mon/Wed/Fri): ").strip()
    # time = input("Enter time (1000-1300): ").strip()

    # split_days = days.split("/")
    # start, end = time.split("-")

    # get the class from the database
    section = get_class_section(db, class_id)
    course = get_course(db, int(section.course_id))
    department = get_department(db, int(course.department_id))
    name = department.subject + " " + str(course.number)
    days = section.days
    time = f"{section.start_time.strftime('%H:%M')} {section.end_time.strftime('%H:%M')}"


    # Check for conflicts
    def parse_time(t_str):
        # Convert "15:00" → datetime.time(15, 0)
        return datetime.strptime(t_str, "%H:%M").time()

    for course in schedule:
        d = course["days"]              # e.g. "MoWe"
        t = course["time"]              # e.g. "15:00 16:20"
        
        # Split day string into 2-letter parts
        d_split = [d[i:i+2] for i in range(0, len(d), 2)]

        split_days = [days[i:i+2] for i in range(0, len(days), 2)]
        
        # Split time string into start/end
        t_split = t.split(" ")
        time_start = parse_time(t_split[0])
        time_end   = parse_time(t_split[1])
        
        # Convert the new course's times too
        new_t_split = time.split(" ")
        new_start = parse_time(new_t_split[0])
        new_end = parse_time(new_t_split[1])


        for day in d_split:
            if day in split_days:  # same day
                # PROPER overlap check:
                if new_start < time_end and time_start < new_end:
                    print(f"\nConflict with day/time between {name} on {time, days} and {course['name']} on {t, d}")
                    return


        
    schedule.append({
        "id": class_id,
        "name": name,
        "days": days,
        "time": time
    })

    print(f"Added: {name} on {days} at {time}")

# View schedge in terminal
def view_schedule(schedule):
    if not schedule:
        print("\nNo classes added yet.")
        return

    print("\nCurrent Schedule")
    for i, cls in enumerate(schedule, 1):
        print(f"{i}. {cls['name']} - {cls['days']} - {cls['time']}")
    
    print("\n")

# Save to file
def save_schedule(schedule, filename="schedule.txt"):
    with open(filename, "w") as f:
        f.write("Your Schedule:\n")
        f.write("------------------------\n")
        for cls in schedule:
            f.write(f"{cls['name']} - {cls['days']} - {cls['time']}\n")
        f.write("------------------------\n")

    print(f"\nSchedule saved to {filename}")

def remove_class(schedule):
    class_id = int(input("Enter course id (i.e 469) "))
    for i, c in enumerate(schedule):
        if c["id"] == class_id:
            name = c["name"]
            del schedule[i]
            print(f"Removed: {name}")
            return True   # removed successfully
    return False      


def main():
    schedule = []

    while True:
        display_menu()
        choice = input("Choose an option: ").strip()

        if choice == "1":
            add_class(schedule)
        elif choice == "2":
            view_schedule(schedule)
        elif choice == "3":
            save_schedule(schedule)
            break
        elif choice == "4":
            remove_class(schedule)
        else:
            print("error")


if __name__ == "__main__":
    main()
