# Startup display
def display_menu():
    print("1. Add a class")
    print("2. View current schedule")
    print("3. Save & exit")

# get the class details
def add_class(schedule):
    name = input("Enter class name: ").strip()
    days = input("Enter day (Mon/Wed/Fri): ").strip()
    time = input("Enter time (1000-1300): ").strip()

    split_days = days.split("/")
    start, end = time.split("-")

    # Check for conflicts
    for course in schedule:
        d = course["days"]
        t = course["time"]

        d_split = d.split("/")
        t_split = t.split("-")

        for day in d_split:
            time_start = t_split[0]
            time_end = t_split[1]
            if day in split_days and ((time_start >= start and time_start <= end) or (time_end >= start and time_end <= end)):
                print(f"\nConflict with day/time between {name} and {course['name']}")
                return

        
    schedule.append({
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
        else:
            print("error")


if __name__ == "__main__":
    main()
