const { useState, useRef, useEffect } = React;

// DeepSeek-R1 (Ollama /v1 path) ---
const BASE_URL = "http://localhost:8000"; // FastAPI, not Ollama
// const API_KEY = "local"; // not needed for FastAPI unless you want it

async function sendMessageLLM(userText, onToken) {
	const res = await fetch(`${BASE_URL}/ollama/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// no Authorization header needed for the tiny FastAPI example
		},
		body: JSON.stringify({ message: userText }),
	});

	if (!res.ok) {
		throw new Error(`LLM request failed: ${res.status}`);
	}

	// FastAPI returns a normal JSON body, not a stream
	const data = await res.json();
	// { reply: "full answer text" }
	onToken(data.reply); // call your appendToken once with the whole reply
}

function ChatUI() {
	const [messages, setMessages] = useState([
		{ role: "assistant", content: "Hello! How can I help you today?" },
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const [visualizationData, setVisualizationData] = useState(null);
	const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);
	const [class_code, setClass_code] = useState(""); // New state for class code input
	const [availableSections, setAvailableSections] = useState([]); // Sections returned from API
	const [showSectionModal, setShowSectionModal] = useState(false); // Modal visibility
	const [showCoursesPanel, setShowCoursesPanel] = useState(false); // Course browser panel
	const [allCourses, setAllCourses] = useState([]); // All available courses
	const [isLoadingCourses, setIsLoadingCourses] = useState(false);
	const [courseSearchQuery, setCourseSearchQuery] = useState(""); // Search query for courses
	const [showCourseDetailModal, setShowCourseDetailModal] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState(null);
	const messagesEndRef = useRef(null);
	const textareaRef = useRef(null);
	const fileInputRef = useRef(null);

	const openCourseDetails = (course) => {
		setSelectedCourse(course);
		setShowCourseDetailModal(true);
	};

	const closeCourseDetails = () => {
		setShowCourseDetailModal(false);
		setSelectedCourse(null);
	};

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height =
				Math.min(textareaRef.current.scrollHeight, 200) + "px";
		}
	}, [input]);

	const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFiles(prev => [...prev, {
        name: file.name,
        size: (file.size / 1024).toFixed(2) + " KB",
        type: file.type,
    }]);

    // Build form-data for FastAPI upload
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${BASE_URL}/upload-audit/`, {
            method: "POST",
            body: formData
        });

        if (!res.ok) throw new Error("Schedule fetch failed");

        const schedule = await res.json(); // ← DUMMY_SCHEDULE arrives here

        setVisualizationData({
            type: "schedule",
            data: schedule,
        });
    } catch (err) {
        console.error(err);
        alert("Failed to load schedule from backend");
    }
};

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const userMessage = input.trim();
		setInput("");
		setIsLoading(true);

		// push user, then an empty assistant placeholder to stream into
		setMessages((prev) => [
			...prev,
			{ role: "user", content: userMessage },
			{ role: "assistant", content: "" },
		]);

		const appendToken = (t) => {
			setMessages((prev) => {
				const copy = [...prev];
				const last = copy[copy.length - 1];
				copy[copy.length - 1] = { ...last, content: last.content + t };
				return copy;
			});
		};

		try {
			await sendMessageLLM(userMessage, appendToken);
		} catch (err) {
			// show an error bubble if the request fails
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: `⚠️ ${err.message}` },
			]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const removeFile = (index) => {
		setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const toggleRightPanel = () => {
		setIsRightPanelExpanded(!isRightPanelExpanded);
	};

	// Helper function to parse day abbreviations (e.g., "MoTuWe" -> ["Monday", "Tuesday", "Wednesday"])
	const parseDayAbbreviations = (dayStr) => {
		const dayMap = {
			"Mo": "Monday",
			"Tu": "Tuesday",
			"We": "Wednesday",
			"Th": "Thursday",
			"Fr": "Friday",
			"Sa": "Saturday",
			"Su": "Sunday"
		};
		
		const days = [];
		for (let i = 0; i < dayStr.length; i += 2) {
			const abbr = dayStr.substring(i, i + 2);
			if (dayMap[abbr]) {
				days.push(dayMap[abbr]);
			}
		}
		return days;
	};

	// Function to handle adding course - fetches available sections
	const handleAddCourse = async () => {
		if (!class_code.trim()) {
			alert("Please enter a class code");
			return;
		}

		try {
			const res = await fetch(`${BASE_URL}/schedule/${class_code}`, {
				method: "GET",
			});

			if (!res.ok) throw new Error("Failed to fetch course sections");

			const sections = await res.json();
			// sections should be an array of ScheduleItem objects
			setAvailableSections(sections);
			setShowSectionModal(true);
			
		} catch (err) {
			console.error(err);
			alert(`Failed to add course: ${err.message}`);
		}
	};

	// Function to handle selecting a section from the modal
	const handleSelectSection = (section) => {
		// Parse the day string to get individual days
		const days = parseDayAbbreviations(section.day);
		
		// Create a separate entry for each day
		const newEntries = days.map(day => ({
			...section,
			day: day
		}));

		// Add the selected section(s) to the visualization data
		if (visualizationData) {
			setVisualizationData({
				...visualizationData,
				data: [...visualizationData.data, ...newEntries],
			});
		} else {
			setVisualizationData({
				type: "schedule",
				data: newEntries,
			});
		}

		// Close modal and reset
		setShowSectionModal(false);
		setAvailableSections([]);
		setClass_code("");
	};

	const closeModal = () => {
		setShowSectionModal(false);
		setAvailableSections([]);
	};

	// Function to fetch all courses
	const fetchAllCourses = async () => {
		setIsLoadingCourses(true);
		try {
			const res = await fetch(`${BASE_URL}/schedule/get_courses`, {
				method: "GET",
			});

			if (!res.ok){
				const text = await res.text();
  				throw new Error(`Failed to fetch courses: ${res.status} ${text}`);
			}

			const courses = await res.json();
			console.log("Fetched courses:", courses); // Debug log
			console.log("Number of courses:", courses.length); // Debug log
			setAllCourses(courses);
		} catch (err) {
			console.error("Error fetching courses:", err);
			alert(`Failed to load courses: ${err.message}`);
		} finally {
			setIsLoadingCourses(false);
		}
	};

	// Toggle courses panel and fetch if needed
	const toggleCoursesPanel = () => {
		if (!showCoursesPanel && allCourses.length === 0) {
			fetchAllCourses();
		}
		setShowCoursesPanel(!showCoursesPanel);
	};

	// Handle clicking a course from the browser
	const handleCourseClick = (courseCode) => {
		setClass_code(courseCode);
		setShowCoursesPanel(false);
		// Note: we need to fetch sections with the course code, so we'll call the API directly
		// instead of calling handleAddCourse() which expects class_code state to be set
		fetchCourseSections(courseCode);
	};

	// Fetch sections for a specific course code
	const fetchCourseSections = async (courseCode) => {
		try {
			const res = await fetch(`${BASE_URL}/schedule/${courseCode}`, {
				method: "GET",
			});

			if (!res.ok) throw new Error("Failed to fetch course sections");

			const sections = await res.json();
			setAvailableSections(sections);
			setShowSectionModal(true);
		} catch (err) {
			console.error(err);
			alert(`Failed to add course: ${err.message}`);
		}
	};

	// Filter courses based on search query
	const filteredCourses = allCourses.filter(course => {
		const searchLower = courseSearchQuery.toLowerCase();
		return (
			course.department.toLowerCase().includes(searchLower) ||
			course.course_code.toString().includes(searchLower) ||
			course.course_name.toLowerCase().includes(searchLower) ||
			(course.description && course.description.toLowerCase().includes(searchLower))
		);
	});

	// Debug log
	console.log("All courses:", allCourses);
	console.log("Filtered courses:", filteredCourses);
	console.log("Search query:", courseSearchQuery);

	return (
		<div className="flex h-screen bg-slate-100 relative">
			{/* Left Side - Chat Interface */}
			<div
				className={`flex flex-col border-r border-slate-300 bg-white transition-all duration-500 ease-in-out overflow-hidden ${
					isRightPanelExpanded ? "w-0" : "w-1/2"
				}`}
			>
				{/* Header */}
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold text-white">Advisor Chat</h1>
					</div>
				</header>

				{/* Messages Container */}
				<div className="flex-1 overflow-y-auto">
					<div className="px-4 py-4 space-y-3">
						{messages.map((message, index) => (
							<div
								key={index}
								className={`flex gap-2 ${
									message.role === "user" ? "justify-end" : "justify-start"
								}`}
							>
								{message.role === "assistant" && (
									<div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 flex items-center justify-center shadow-sm text-white text-xs font-bold">
										AI
									</div>
								)}

								<div
									className={`max-w-md rounded-xl px-3 py-2 shadow-sm text-sm ${
										message.role === "user"
											? "text-white"
											: "bg-slate-50 text-slate-800 border border-slate-200"
									}`}
									style={
										message.role === "user"
											? { backgroundColor: "#BE0000" }
											: {}
									}
								>
									<p className="whitespace-pre-wrap leading-snug">
										{message.content}
									</p>
								</div>

								{message.role === "user" && (
									<div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shadow-sm text-white text-sm">
										👤
									</div>
								)}
							</div>
						))}

						{isLoading && (
							<div className="flex gap-2 justify-start">
								<div className="bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
									<div className="flex gap-1">
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "0ms" }}
										></div>
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "150ms" }}
										></div>
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "300ms" }}
										></div>
									</div>
								</div>
							</div>
						)}

						<div ref={messagesEndRef} />
					</div>
				</div>

				{/* Input Area */}
				<div className="border-t border-slate-200 px-6 py-4 bg-white">
					<div>
						<div
							className="relative flex items-center gap-3 bg-slate-50 rounded-full border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-opacity-50 transition-all"
							style={{
								focusWithinBorderColor: "#BE0000",
								focusWithinRingColor: "#BE0000",
							}}
						>
							<button
								onClick={() => fileInputRef.current?.click()}
								className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-all text-sm font-bold"
								title="Upload file"
							>
								+
							</button>
							<input
								ref={fileInputRef}
								type="file"
								onChange={handleFileUpload}
								className="hidden"
								multiple
								accept=".txt,.pdf,.doc,.docx,.csv"
							/>
							<input
								type="text"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Type your message here..."
								className="flex-1 bg-transparent px-2 py-1 outline-none text-slate-800 placeholder-slate-400"
								disabled={isLoading}
							/>
							<button
								onClick={handleSubmit}
								disabled={!input.trim() || isLoading}
								className="flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-lg"
								style={{ backgroundColor: "#BE0000" }}
							>
								➤
							</button>
						</div>

						{/* Uploaded Files Display - Below chat bar */}
						{uploadedFiles.length > 0 && (
							<div className="mt-2 flex gap-2 overflow-x-auto">
								{uploadedFiles.map((file, index) => (
									<div
										key={index}
										className="flex-shrink-0 flex items-center gap-1 bg-slate-100 rounded px-2 py-1 border border-slate-200"
									>
										<span style={{ fontSize: "10px" }}>📄</span>
										<span className="text-xs text-slate-700 max-w-32 truncate">
											{file.name}
										</span>
										<button
											onClick={() => removeFile(index)}
											className="text-slate-400 hover:text-red-500 text-xs ml-0.5"
										>
											×
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Right Side - Visualizations & File Management */}
			<div
				className={`flex flex-col bg-slate-50 transition-all duration-500 ease-in-out ${
					isRightPanelExpanded ? "w-full" : "w-1/2"
				}`}
			>
				{/* Right Panel Header */}
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center justify-between shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-4">
						<h2 className="text-xl font-semibold text-white">View</h2>
						<button
							onClick={toggleCoursesPanel}
							className="px-3 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
							style={{ color: "#BE0000" }}
						>
							{showCoursesPanel ? "Hide Courses" : "Browse Courses"}
						</button>
					</div>
					<div className="flex items-center gap-3">
						<button
							onClick={() => {
								// Add your logout logic here
								console.log("Logout clicked");
								// Example: window.location.href = '/login';
							}}
							className="px-2 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm"
							style={{ color: "#BE0000", fontSize: "10px" }}
						>
							Logout
						</button>
						<div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
							<div className="text-xl font-bold" style={{ color: "#BE0000" }}>
								U
							</div>
						</div>
					</div>
				</header>

				{/* Content Area */}
				<div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
					{/* Courses Slide-in Panel */}
					<div
						className={`absolute top-0 right-0 h-full bg-white shadow-2xl transition-transform duration-300 ease-in-out z-20 ${
							showCoursesPanel ? "translate-x-0" : "translate-x-full"
						}`}
						style={{ width: "400px" }}
					>
						<div className="h-full flex flex-col">
							<div className="p-4 border-b border-slate-200">
								<div className="flex justify-between items-center mb-3">
									<h3 className="text-lg font-semibold text-slate-800">
										Available Courses
									</h3>
									<button
										onClick={toggleCoursesPanel}
										className="text-slate-400 hover:text-slate-600 text-xl font-bold"
									>
										×
									</button>
								</div>
								<input
									type="text"
									value={courseSearchQuery}
									onChange={(e) => setCourseSearchQuery(e.target.value)}
									placeholder="Search courses..."
									className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 text-sm"
									style={{ focusRingColor: "#BE0000" }}
								/>
							</div>
							
							<div className="flex-1 overflow-y-auto p-4">
								{isLoadingCourses ? (
									<div className="text-center py-8 text-slate-500">
										<div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2" style={{ borderColor: "#BE0000" }}></div>
										<p>Loading courses...</p>
									</div>
								) : filteredCourses.length === 0 ? (
									<p className="text-center text-slate-500 py-8">
										{courseSearchQuery ? "No courses match your search" : "No courses available"}
									</p>
								) : (
									<div className="space-y-2">
										{filteredCourses.map((course, index) => (
											<div
												key={index}
												onClick={() => openCourseDetails(course)}
												className="border border-slate-200 rounded-lg p-3 hover:border-red-700 hover:bg-slate-50 cursor-pointer transition-all"
											>
												<div className="flex justify-between items-start mb-1">
													<h4 className="font-semibold text-slate-800 text-sm">
														{course.department} {course.course_code}
													</h4>
													<span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
														{course.credits} credits
													</span>
												</div>
												<p className="text-sm text-slate-700 font-medium mb-1">
													{course.course_name}
												</p>
												{course.description && (
													<p className="text-xs text-slate-600 line-clamp-2">
														{course.description}
													</p>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Visualization Section */}
					{visualizationData && (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
							<h3 className="text-base font-semibold text-slate-800 mb-3">
								Weekly Class Schedule
							</h3>

							{/* Calendar Grid */}
							<div className="w-full">
								{/* Header with days */}
								<div className="grid grid-cols-6 gap-1 mb-1">
									<div className="text-xs font-semibold text-slate-600 text-center py-1">
										Time
									</div>
									{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
										<div
											key={day}
											className="text-xs font-semibold text-slate-600 text-center py-1"
										>
											{day}
										</div>
									))}
								</div>

								{/* Time slots with positioning */}
								<div className="relative">
									{/* Background grid */}
									<div className="space-y-0.5">
										{[
											"8AM",
											"9AM",
											"10AM",
											"11AM",
											"12PM",
											"1PM",
											"2PM",
											"3PM",
											"4PM",
											"5PM",
										].map((time) => (
											<div key={time} className="grid grid-cols-6 gap-1">
												<div className="text-xs text-slate-500 py-1 text-right pr-1 h-10">
													{time}
												</div>
												{[
													"Monday",
													"Tuesday",
													"Wednesday",
													"Thursday",
													"Friday",
												].map((day) => (
													<div
														key={`${day}-${time}`}
														className="h-10 border border-slate-100 rounded bg-slate-50"
													></div>
												))}
											</div>
										))}
									</div>

									{/* Absolute positioned classes */}
									<div className="absolute inset-0 pointer-events-none">
										<div className="grid grid-cols-6 gap-1 h-full">
											<div></div>
											{[
												"Monday",
												"Tuesday",
												"Wednesday",
												"Thursday",
												"Friday",
											].map((day) => (
												<div key={day} className="relative">
													{visualizationData.data
														.filter((item) => item.day === day)
														.map((classItem, idx) => {
															// Parse start time
															const startMatch =
																classItem.startTime.match(
																	/(\d+):(\d+)\s*(AM|PM)/
																);
															let startHour = parseInt(startMatch[1]);
															const startMin = parseInt(startMatch[2]);
															const startPeriod = startMatch[3];
															if (startPeriod === "PM" && startHour !== 12)
																startHour += 12;
															if (startPeriod === "AM" && startHour === 12)
																startHour = 0;

															// Parse end time
															const endMatch =
																classItem.endTime.match(
																	/(\d+):(\d+)\s*(AM|PM)/
																);
															let endHour = parseInt(endMatch[1]);
															const endMin = parseInt(endMatch[2]);
															const endPeriod = endMatch[3];
															if (endPeriod === "PM" && endHour !== 12)
																endHour += 12;
															if (endPeriod === "AM" && endHour === 12)
																endHour = 0;

															// Calculate position and height (each hour = 40px + 2px gap)
															const startOffset =
																(startHour - 8) * 42 +
																(startMin / 60) * 42;
															const duration =
																endHour -
																startHour +
																(endMin - startMin) / 60;
															const height = duration * 42 - 2;

															return (
																<div
																	key={idx}
																	className="absolute rounded px-1.5 py-1 text-white pointer-events-auto"
																	style={{
																		backgroundColor: "#BE0000",
																		top: `${startOffset}px`,
																		height: `${height}px`,
																		left: 0,
																		right: 0,
																	}}
																>
																	<div
																		className="font-semibold truncate"
																		style={{ fontSize: "10px" }}
																	>
																		{classItem.class_}
																	</div>
																	<div
																		className="truncate"
																		style={{
																			fontSize: "9px",
																			opacity: 0.9,
																		}}
																	>
																		{classItem.room}
																	</div>
																	<div
																		className="truncate"
																		style={{
																			fontSize: "8px",
																			opacity: 0.8,
																		}}
																	>
																		{classItem.startTime}-
																		{classItem.endTime}
																	</div>
																</div>
															);
														})}
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
						</div>
					)}
					{/* Empty State for Visualizations */}
					{!visualizationData && (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
							<h3 className="text-lg font-semibold text-slate-800 mb-4">
								Visualizations
							</h3>
							<div className="text-center py-12 text-slate-500">
								<p className="text-4xl mb-2">📊</p>
								<p>No visualizations yet</p>
								<p className="text-sm mt-1">
									Upload a transcript to generate a schedule
								</p>
							</div>
						</div>
					)}
					
					{/* Add Course Section */}
					<div className="mt-4 flex justify-center items-center gap-3">
						<input
							type="text"
							value={class_code}
							onChange={(e) => setClass_code(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleAddCourse();
								}
							}}
							placeholder="Enter class code (e.g., 1410)"
							className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 text-slate-800"
							style={{
								focusRingColor: "#BE0000",
							}}
						/>
						<button
							onClick={handleAddCourse}
							className="px-6 py-2 text-white font-semibold rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
							style={{ backgroundColor: '#BE0000' }}
						>
							<span>+</span>
							ADD COURSE
						</button>
					</div>
				</div>
			</div>

			{/* Section Selection Modal */}
			{showSectionModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
						<div className="flex justify-between items-center mb-4">
							<h3 className="text-xl font-semibold text-slate-800">
								Select a Section for Class {class_code}
							</h3>
							<button
								onClick={closeModal}
								className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
							>
								×
							</button>
						</div>
						
						<div className="space-y-3">
							{availableSections.length === 0 ? (
								<p className="text-center text-slate-500 py-8">No sections available</p>
							) : (
								availableSections.map((section, index) => (
									<div
										key={index}
										onClick={() => handleSelectSection(section)}
										className="border border-slate-200 rounded-lg p-4 hover:border-red-700 hover:bg-slate-50 cursor-pointer transition-all"
									>
										<div className="flex justify-between items-start">
											<div>
												<h4 className="font-semibold text-slate-800 mb-1">
													{section.class_}
												</h4>
												<p className="text-sm text-slate-600">
													<span className="font-medium">Day:</span> {section.day}
												</p>
												<p className="text-sm text-slate-600">
													<span className="font-medium">Time:</span> {section.startTime} - {section.endTime}
												</p>
												<p className="text-sm text-slate-600">
													<span className="font-medium">Room:</span> {section.room}
												</p>
											</div>
											<button
												className="px-3 py-1 text-white text-sm font-semibold rounded hover:opacity-90"
												style={{ backgroundColor: '#BE0000' }}
											>
												Select
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			)}

						{/* Course Detail Modal */}
			{showCourseDetailModal && selectedCourse && (
			<div
				className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
				onClick={closeCourseDetails} // click outside closes
			>
				<div
				className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto"
				onClick={(e) => e.stopPropagation()} // prevent outside click close
				>
				<div className="flex justify-between items-start mb-4">
					<div>
					<h3 className="text-xl font-semibold text-slate-800">
						{selectedCourse.department} {selectedCourse.course_code}: {selectedCourse.course_name}
					</h3>
					<p className="text-sm text-slate-500 mt-1">
						{selectedCourse.credits} credits
					</p>
					</div>

					<button
					onClick={closeCourseDetails}
					className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
					aria-label="Close"
					>
					×
					</button>
				</div>

				<div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
					{selectedCourse.description && selectedCourse.description.trim().length > 0
					? selectedCourse.description
					: "No description available for this course."}
				</div>

				<div className="mt-6 flex justify-end">
					<button
					onClick={closeCourseDetails}
					className="px-4 py-2 text-white font-semibold rounded-lg hover:opacity-90"
					style={{ backgroundColor: "#BE0000" }}
					>
					Close
					</button>
				</div>
				</div>
			</div>
			)}

			{/* Expand/Collapse Button */}
			<button
				onClick={toggleRightPanel}
				className="absolute top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md border flex items-center justify-center hover:bg-slate-50 z-10"
				style={{
					left: isRightPanelExpanded ? "10px" : "calc(50% - 12px)",
					borderColor: "#BE0000",
					transition: "left 0.5s ease-in-out",
				}}
				title={isRightPanelExpanded ? "Show chat" : "Expand panel"}
			>
				{isRightPanelExpanded ? (
					<span className="text-xs font-bold" style={{ color: "#BE0000" }}>
						×
					</span>
				) : (
					<div
						className="w-2 h-2 rounded-full"
						style={{ backgroundColor: "#BE0000" }}
					></div>
				)}
			</button>
			
		</div>
		
	);
	
	
}