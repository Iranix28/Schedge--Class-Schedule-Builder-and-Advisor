import requests
from bs4 import BeautifulSoup
import re
import json

def parse_prerequisites(prereq_text):
    """
    Parse prerequisite text and return a nested list structure.
    CONVENTION:
    - Base level items are AND'd together (all required)
    - Sublists contain items that are OR'd together (pick one)
    
    Examples:
    - ["CS1400"] = just CS1400
    - [["CS1400", "CS1420"]] = CS1400 OR CS1420
    - ["CS1400", "MATH1210"] = CS1400 AND MATH1210
    - [["CS1400", "CS1420"], "MATH1210"] = (CS1400 OR CS1420) AND MATH1210
    - [["PHYS2220", ["ECE1240", "ECE1245", "ECE1050"]]] = PHYS2220 OR (ECE1240 AND ECE1245 AND ECE1050)
    """
    if not prereq_text or prereq_text.strip() == '':
        return []
    
    # Remove common non-course items
    prereq_text = re.sub(r'AP\s+[A-Za-z]+\s+[A-Z&]+\s+score[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'instructor\s+consent', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'permission\s+of\s+instructor', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'(full\s+)?major\s+status[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'foundational\s+courses[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'minor\s+(in|OR)[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'higher\s+math', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'graduate\s+status[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'\bNOT\s+on[^,.\)]*', '', prereq_text, flags=re.IGNORECASE)
    prereq_text = re.sub(r'pre/corequisite:', '', prereq_text, flags=re.IGNORECASE)
    
    # Extract course codes (exclude AND/OR as department codes)
    course_pattern = r'\b(?!AND\b|OR\b)([A-Z]{2,4})\s*(\d{4})\b'
    
    # Check for complex nested OR of groups: ((A) OR (B) OR (C)...)
    # This pattern means: multiple groups where you pick ONE group, and within a group all courses are required
    has_nested_or = re.search(r'\(\(([^)]+)\)(?:\s+OR\s+\(([^)]+)\))+\)', prereq_text, re.IGNORECASE)
    
    if has_nested_or:
        # Extract all groups within the outer parentheses
        # Use a greedy match to get everything between (( and ))
        outer_match = re.search(r'\(\(((?:[^()]|\([^)]*\))*)\)\)', prereq_text, re.IGNORECASE)
        if outer_match:
            inner_content = outer_match.group(1)
            
            # Split by ) OR ( to get individual groups, but be careful with nested parens
            # Simple approach: split on ") OR (" 
            group_texts = re.split(r'\)\s+OR\s+\(', inner_content, flags=re.IGNORECASE)
            
            # Clean up first and last groups
            if group_texts:
                group_texts[0] = group_texts[0].lstrip('(')
                group_texts[-1] = group_texts[-1].rstrip(')')
            
            or_groups = []
            for group_text in group_texts:
                # Skip groups with no course codes (like AP scores)
                if not re.search(r'\b[A-Z]{2,4}\s*\d{4}', group_text):
                    continue
                    
                # Find all courses with full dept codes
                courses_in_group = []
                last_dept_in_group = None
                
                for match in re.finditer(course_pattern, group_text):
                    dept = match.group(1)
                    num = match.group(2)
                    course_code = dept + num
                    courses_in_group.append(course_code)
                    last_dept_in_group = dept
                
                # Find standalone numbers in this group
                if last_dept_in_group:
                    for match in re.finditer(r'(?<![A-Z])\b(\d{4})\b', group_text):
                        num = match.group(1)
                        course_code = last_dept_in_group + num
                        if course_code not in courses_in_group:
                            courses_in_group.append(course_code)
                
                if len(courses_in_group) > 1:
                    # Multiple courses AND'd together in this group
                    or_groups.append(courses_in_group)
                elif len(courses_in_group) == 1:
                    or_groups.append(courses_in_group[0])
            
            # Now check if there are courses BEFORE this nested structure
            before_text = prereq_text[:outer_match.start()]
            before_courses = []
            for match in re.finditer(course_pattern, before_text):
                dept = match.group(1)
                num = match.group(2)
                before_courses.append(dept + num)
            
            # Combine: before courses (AND'd) with the OR groups
            if before_courses and or_groups:
                return before_courses + [or_groups]
            elif or_groups:
                return [or_groups]
            elif before_courses:
                return before_courses
    
    # Otherwise, use the simpler linear parsing
    all_courses = []
    for match in re.finditer(course_pattern, prereq_text):
        dept = match.group(1)
        num = match.group(2)
        course_code = dept + num
        all_courses.append((course_code, match.start(), match.end()))
    
    if not all_courses:
        return []
    
    # Remove duplicates while preserving order
    seen = set()
    unique_courses = []
    for code, start, end in all_courses:
        if code not in seen:
            seen.add(code)
            unique_courses.append((code, start, end))
    
    # Analyze relationships between adjacent courses
    result = []
    i = 0
    while i < len(unique_courses):
        code, start, end = unique_courses[i]
        
        if i < len(unique_courses) - 1:
            next_start = unique_courses[i + 1][1]
            between_text = prereq_text[end:next_start].lower()
            
            # Check if they're OR'd together (and not separated by AND)
            if ' or ' in between_text and ' and ' not in between_text:
                or_group = [code]
                i += 1
                while i < len(unique_courses):
                    or_group.append(unique_courses[i][0])
                    if i < len(unique_courses) - 1:
                        next_start = unique_courses[i + 1][1]
                        between_text = prereq_text[unique_courses[i][2]:next_start].lower()
                        if ' or ' not in between_text or ' and ' in between_text:
                            break
                    i += 1
                
                if len(or_group) > 1:
                    result.append(or_group)  # Sublist = OR
                else:
                    result.append(or_group[0])
            else:
                result.append(code)  # Base level = AND
                i += 1
        else:
            result.append(code)
            i += 1
    
    # Final deduplication pass
    final_result = []
    all_seen = set()
    
    for item in result:
        if isinstance(item, list):
            unique_sublist = []
            for course in item:
                if course not in all_seen:
                    unique_sublist.append(course)
                    all_seen.add(course)
            if len(unique_sublist) > 1:
                final_result.append(unique_sublist)
            elif len(unique_sublist) == 1:
                final_result.append(unique_sublist[0])
        elif isinstance(item, str):
            if item not in all_seen:
                final_result.append(item)
                all_seen.add(item)
    
    return final_result

def get_description(course_id, section, url_base):
    """
    Fetch course description from the detail page.
    """
    try:
        # Build URL to description page
        desc_url = f"{url_base}description.html?subj=CS&catno={course_id}&section={section}"
        response = requests.get(desc_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find description in various possible locations
        desc_elem = soup.find('div', class_='description')
        if not desc_elem:
            desc_elem = soup.find('p', class_='description')
        if not desc_elem:
            # Try to find any paragraph with description-like content
            for p in soup.find_all('p'):
                text = p.get_text(strip=True)
                if len(text) > 50 and 'prerequisite' not in text.lower():
                    desc_elem = p
                    break
        
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return ''
    except:
        return ''

def scrape_utah_cs_courses(url):
    """
    Scrape course information from Utah CS class schedule.
    """
    # Fetch the webpage
    response = requests.get(url)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.content, 'html.parser')
    url_base = '/'.join(url.split('/')[:-1]) + '/'
    
    courses = []
    seen_courses = set()  # Track course+section to avoid duplicates
    
    # Find all course sections (each h3 with course info)
    course_headers = soup.find_all('h3')
    
    for header in course_headers:
        try:
            # Get course title from the h3
            header_text = header.get_text(strip=True)
            
            # Parse "CS 1400 - 001 Intro Comp Programming"
            match = re.match(r'([A-Z]+)\s*(\d+)\s*-\s*(\d+)\s*(.+)', header_text)
            if not match:
                continue
            
            course_id = match.group(1) + match.group(2)
            section = match.group(3)
            course_name = match.group(4)
            
            # Skip duplicates (each course appears twice in the HTML)
            course_key = f"{course_id}-{section}"
            if course_key in seen_courses:
                continue
            seen_courses.add(course_key)
            
            # Find the parent section that contains this course's details
            section_div = header.find_parent()
            while section_div and section_div.name != 'body':
                # Look for bullet list with details
                details = section_div.find_all('li')
                if details:
                    break
                section_div = section_div.find_parent()
            
            # Extract details from the list items
            instructor = ''
            component = ''
            units = ''
            seats = ''
            
            if section_div:
                details = section_div.find_all('li')
                for detail in details:
                    text = detail.get_text(strip=True)
                    if 'Instructor:' in text:
                        instructor = text.replace('Instructor:', '').strip()
                    elif 'Component:' in text:
                        component = text.replace('Component:', '').strip()
                    elif 'Units:' in text:
                        units = text.replace('Units:', '').strip()
                    elif 'Seats Available:' in text:
                        seats = text.replace('Seats Available:', '').strip()
            
            # Find schedule from table
            schedule = ''
            table = section_div.find('table') if section_div else None
            if table:
                rows = table.find_all('tr')
                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        days_times = cells[0].get_text(strip=True)
                        location = cells[1].get_text(strip=True)
                        schedule = f"{days_times} - {location}"
                        break
            
            # Get description (would need to make another request to detail page)
            # For now, leave it empty or make request if needed
            description = ''
            
            # Get prerequisites and description from the description page
            prereq_list = []
            description = ''
            try:
                desc_url = f"{url_base}description.html?subj=CS&catno={match.group(2)}&section={section}"
                print(f"Fetching: {desc_url}")
                desc_response = requests.get(desc_url, timeout=10)
                desc_soup = BeautifulSoup(desc_response.content, 'html.parser')
                
                # Get the full page text
                page_text = desc_soup.get_text()
                
                # Debug: print a snippet of the page
                if 'requisite' in page_text.lower() or 'requirement' in page_text.lower():
                    print(f"Found requisite text for {course_id}")
                    # Find and print the relevant section
                    lines = page_text.split('\n')
                    for i, line in enumerate(lines):
                        if 'requisite' in line.lower() or 'requirement' in line.lower():
                            context = '\n'.join(lines[max(0,i-2):min(len(lines),i+5)])
                            print(f"Context:\n{context}\n")
                            break
                
                # Look for "Prerequisites:" or "Enrollment Requirement:"
                prereq_patterns = [
                    r'Prerequisites?\s*:\s*([^\n\.]+(?:[^\n]*(?:and|or|AND|OR)[^\n]*)*)',
                    r'Enrollment Requirement\s*:\s*Prerequisites?\s*:\s*([^\n\.]+(?:[^\n]*(?:and|or|AND|OR)[^\n]*)*)',
                ]
                
                for pattern in prereq_patterns:
                    prereq_match = re.search(pattern, page_text, re.IGNORECASE)
                    if prereq_match:
                        prereq_text = prereq_match.group(1).strip()
                        print(f"Found prereq text: {prereq_text}")
                        
                        # Stop at common breaks
                        for break_word in ['Corequisite', 'Description', 'Note:', '\n\n']:
                            if break_word in prereq_text:
                                prereq_text = prereq_text.split(break_word)[0]
                        
                        # Clean up the text
                        prereq_text = prereq_text.strip(' .,;')
                        
                        if prereq_text and prereq_text.lower() not in ['none', 'n/a']:
                            prereq_list = parse_prerequisites(prereq_text)
                            print(f"Parsed prereqs: {prereq_list}")
                            
                            # Filter out the current course
                            filtered_list = []
                            for item in prereq_list:
                                if isinstance(item, list):
                                    filtered_sublist = [p for p in item if p != course_id]
                                    if len(filtered_sublist) > 1:
                                        filtered_list.append(filtered_sublist)
                                    elif len(filtered_sublist) == 1:
                                        filtered_list.append(filtered_sublist[0])
                                elif isinstance(item, str) and item != course_id:
                                    filtered_list.append(item)
                            prereq_list = filtered_list
                            print(f"Filtered prereqs: {prereq_list}")
                        break
                
                # Get description from the Description section
                desc_match = re.search(r'Description\s*\n\s*([^\n]+(?:\n(?!©|\n)[^\n]+)*)', page_text, re.IGNORECASE)
                if desc_match:
                    description = desc_match.group(1).strip()
                    # Clean up
                    if 'The University of Utah' in description:
                        description = description.split('The University of Utah')[0].strip()
                    if len(description) > 500:
                        description = description[:500] + '...'
                        
            except Exception as e:
                print(f"Error fetching details for {course_id}-{section}: {e}")
                import traceback
                traceback.print_exc()
                pass
            
            course_data = {
                'course_id': course_id,
                'course_name': course_name,
                'section': section,
                'units': units,
                'instructor': instructor,
                'component': component,
                'available_seats': seats,
                'schedule': schedule,
                'description': description,
                'prerequisites': prereq_list
            }
            
            courses.append(course_data)
            
        except Exception as e:
            print(f"Error processing course: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    return courses

def save_to_file(courses, filename='courses.txt'):
    """
    Save course data to a text file.
    """
    with open(filename, 'w', encoding='utf-8') as f:
        for course in courses:
            f.write(f"Course ID: {course['course_id']}\n")
            f.write(f"Course Name: {course['course_name']}\n")
            f.write(f"Section: {course['section']}\n")
            f.write(f"Units: {course['units']}\n")
            f.write(f"Instructor: {course['instructor']}\n")
            f.write(f"Component: {course['component']}\n")
            f.write(f"Available Seats: {course['available_seats']}\n")
            f.write(f"Schedule: {course['schedule']}\n")
            f.write(f"Description: {course['description']}\n")
            f.write(f"Prerequisites: {json.dumps(course['prerequisites'])}\n")
            f.write("-" * 80 + "\n\n")
    
    print(f"Saved {len(courses)} courses to {filename}")

if __name__ == "__main__":
    url = "https://class-schedule.app.utah.edu/main/1264/class_list.html?subject=CS"
    
    print("Scraping courses...")
    courses = scrape_utah_cs_courses(url)
    
    print(f"Found {len(courses)} courses")
    save_to_file(courses)
    print("Done!")