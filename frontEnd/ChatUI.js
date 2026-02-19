const { useState, useRef, useEffect } = React;

// DeepSeek-R1 (Ollama /v1 path) ---
const BASE_URL = "http://localhost:8000"; // FastAPI, not Ollama

async function sendMessageLLM(userText, onToken) {
	const res = await fetch(`${BASE_URL}/ollama/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ message: userText }),
	});

	if (!res.ok) {
		throw new Error(`LLM request failed: ${res.status}`);
	}

	const data = await res.json();
	onToken(data.reply);
}

function ChatUI({userData, onLogout, savedPlan, semester}) {
	const [messages, setMessages] = useState([
		{ role: "assistant", content: "I am your class advisor, please submit your degree audit by pressing the + button! (ONLY HTML)" },
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const [visualizationData, setVisualizationData] = useState(null);
	const [chatWidthPercent, setChatWidthPercent] = useState(33);
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef(null);
	const [class_code, setClass_code] = useState("");
	const [availableSections, setAvailableSections] = useState([]);
	const [showSectionModal, setShowSectionModal] = useState(false);
	const [showCoursesPanel, setShowCoursesPanel] = useState(false);
	const [allCourses, setAllCourses] = useState([]);
	const [isLoadingCourses, setIsLoadingCourses] = useState(false);
	const [courseSearchQuery, setCourseSearchQuery] = useState("");
	const [showCourseDetailModal, setShowCourseDetailModal] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState(null);
	const [hoveredScheduleItem, setHoveredScheduleItem] = useState(null);
	const messagesEndRef = useRef(null);
	const textareaRef = useRef(null);
	const fileInputRef = useRef(null);
	const [planName, setPlanName] = useState("My Plan");

	const openCourseDetails = (course) => {
		setSelectedCourse(course);
		setShowCourseDetailModal(true);
	};

	//warm up llm to on screen start up and fetch all course info.
	const warmupDoneRef = useRef(false);
	useEffect(() => {
		fetchAllCourses();
		if (warmupDoneRef.current) return;
		warmupDoneRef.current = true;

		// fire and forget warmup
		(async () => {
		try {
			const warmupPrompt = "Warmup. Reply with OK.";
			await sendMessageLLM(warmupPrompt, () => {
			// ignore tokens so nothing is displayed
			});
		} catch (e) {
			// optional: do nothing or log
			console.log("Warmup failed:", e?.message || e);
		}
		})();
	}, []);
	
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

	useEffect(() => {
		const onSubmit = (e) => {
			console.log("FORM SUBMIT CAUGHT", e.target);
			e.preventDefault();
			e.stopPropagation();
		};

		document.addEventListener("submit", onSubmit, true);
		return () => document.removeEventListener("submit", onSubmit, true);
	}, []);

	//CHECKS IF THERE IS PLAN DATA PASSED
	useEffect(() => {
		if (!savedPlan) return;

		// Set plan name
		setPlanName(savedPlan.name || "My Plan");

		// Load chat messages
		if (savedPlan.messages && savedPlan.messages.length > 0) {
			setMessages(savedPlan.messages);
		} else {
			setMessages([
				{
					role: "assistant",
					content: "Plan loaded. No previous chat history."
				}
			]);
		}

		// Load schedule visualization
		if (savedPlan.schedule && savedPlan.schedule.length > 0) {
			setVisualizationData({
				type: "schedule",
				data: savedPlan.schedule
			});
		} else {
			setVisualizationData(null);
		}


	}, [savedPlan]);

	const handleFileUpload = async (e) => {
		const file = e.target.files[0];
		if (!file) return;

		setUploadedFiles(prev => [...prev, {
			name: file.name,
			size: (file.size / 1024).toFixed(2) + " KB",
			type: file.type,
		}]);

		const formData = new FormData();
		formData.append("file", file);

		try {
			const res = await fetch(`${BASE_URL}/upload-audit/`, {
				method: "POST",
				body: formData
			});

			if (!res.ok) throw new Error("Schedule fetch failed");

			const schedule = await res.json();

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

	// Drag handler for resizable panels
	const handleDragStart = (e) => {
		e.preventDefault();
		setIsDragging(true);
	};

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const percent = (x / rect.width) * 100;
			// Clamp between 10% and 70%
			setChatWidthPercent(Math.min(70, Math.max(15.5, percent)));
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging]);

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
			setAvailableSections(sections);
			setShowSectionModal(true);
			
		} catch (err) {
			console.error(err);
			alert(`Failed to add course: ${err.message}`);
		}
	};

	const handleSelectSection = (section) => {
		const days = parseDayAbbreviations(section.day);

		// Extract course number from "1410 - 001"
		const match = section.class_?.match(/(\d+)\s*-\s*(\d+)/);
		if (!match) return;

		const courseCode = match[1];
		const sectionCode = match[2];

		// Find course from allCourses
		const course = allCourses.find(
			c => c.course_code.toString() === courseCode
		);

		if (!course) {
			console.warn("Course not found for code:", courseCode);
			return;
		}

		const newEntries = days.map(day => ({
			...section,
			day: day,
			course_id: course.id,          // attach real DB id
			class_section_id: null         // until backend returns real section ids
		}));

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

		setShowSectionModal(false);
		setAvailableSections([]);
		setClass_code("");
	};

	const closeModal = () => {
		setShowSectionModal(false);
		setAvailableSections([]);
	};

	const fetchAllCourses = async () => {
		setIsLoadingCourses(true);
		try {
			const res = await fetch(`${BASE_URL}/schedule/get_courses`, {
				method: "GET",
			});

			if (!res.ok) throw new Error("Failed to fetch courses");

			const courses = await res.json();
			console.log("Fetched courses:", courses);
			console.log("Number of courses:", courses.length);
			setAllCourses(courses);
		} catch (err) {
			console.error("Error fetching courses:", err);
			alert(`Failed to load courses: ${err.message}`);
		} finally {
			setIsLoadingCourses(false);
		}
	};

	const toggleCoursesPanel = () => {
		if (!showCoursesPanel && allCourses.length === 0) {
			fetchAllCourses();
		}
		setShowCoursesPanel(!showCoursesPanel);
	};

	const handleCourseClick = (course) => {
		setShowCoursesPanel(false);
		openCourseDetails(course);
	};

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

	const handleScheduleItemClick = (scheduleItem) => {
		const courseCodeMatch = scheduleItem.class_.match(/(\d+)/);
		if (!courseCodeMatch) return;
		
		const courseCode = courseCodeMatch[1];
		
		const course = allCourses.find(c => c.course_code.toString() === courseCode);
		
		if (course) {
			openCourseDetails(course);
		} else {
			openCourseDetails({
				department: "CS",
				course_code: courseCode,
				course_name: scheduleItem.class_,
				credits: "N/A",
				description: "Course details not available. Please check the course catalog."
			});
		}
	};

	const handleDeleteCourse = (e, scheduleItem) => {
		e.stopPropagation();
		
		const updatedData = visualizationData.data.filter(
			item => item.class_ !== scheduleItem.class_
		);

		if (updatedData.length === 0) {
			setVisualizationData(null);
		} else {
			setVisualizationData({
				...visualizationData,
				data: updatedData,
			});
		}
	};

	const filteredCourses = allCourses.filter(course => {
		const searchLower = courseSearchQuery.toLowerCase();
		return (
			course.department.toLowerCase().includes(searchLower) ||
			course.course_code.toString().includes(searchLower) ||
			course.course_name.toLowerCase().includes(searchLower) ||
			(course.description && course.description.toLowerCase().includes(searchLower))
		);
	});

	const handleSavePlan = async () => {
		try {
			if (!userData?.id) {
				alert("User not loaded");
				return;
			}

			const payload = {
				user_id: userData.id,   // <-- REQUIRED
				name: planName,
				semester: {
					term_season: semester?.term_season || "Fall",
					term_year: semester?.term_year || new Date().getFullYear(),
				},
				courseSelections: [],
				messages: messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
			};

			if (visualizationData?.data?.length > 0) {
				const seen = new Set();

				visualizationData.data.forEach((item) => {
					if (!item.course_id) return;

					const key = `${item.course_id}-${item.class_section_id || "null"}`;

					if (!seen.has(key)) {
						seen.add(key);

						payload.courseSelections.push({
							course_id: item.course_id,
							class_section_id: item.class_section_id || null,
						});
					}
				});
			}

			const res = await fetch(`${BASE_URL}/plans`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(errText);
			}

			alert("Plan saved successfully");
		} catch (err) {
			console.error("Save error:", err);
			alert("Error saving plan");
		}
	};




	return (
		<div ref={containerRef} className="flex h-screen bg-slate-100 relative" style={{ userSelect: isDragging ? "none" : "auto" }}>
			{/* Left Side - Chat Interface */}
			<div
				className="flex flex-col border-r border-slate-300 bg-white overflow-hidden"
				style={{ width: `${chatWidthPercent}%`, minWidth: "0" }}
			>
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-3">					
						<h1 className="text-xl font-semibold text-white">Advisor Chat</h1>
					</div>
				</header>

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
				{/* all the textbox elements */}
				<div className="border-t border-slate-200 px-6 py-4 bg-white">
					<div>
						<div
							className="relative flex items-center gap-3 bg-slate-50 rounded-full border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-opacity-50 transition-all"
						>
							<button
								type= "button"
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
								accept=".txt,.pdf,.doc,.docx,.csv,.html"
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
								type="button"
								onClick={handleSubmit}
								disabled={!input.trim() || isLoading}
								className="flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-lg"
								style={{ backgroundColor: "#BE0000" }}
							>
								➤
							</button>
						</div>

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
											type="button"
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

			{/* Drag Handle */}
			<div
				onMouseDown={handleDragStart}
				className="flex-shrink-0 w-2 cursor-col-resize flex items-center justify-center hover:bg-red-100 transition-colors group"
				style={{ backgroundColor: isDragging ? "#fecaca" : "transparent" }}
			>
				<div
					className="w-0.5 h-8 rounded-full group-hover:bg-red-400 transition-colors"
					style={{ backgroundColor: isDragging ? "#BE0000" : "#cbd5e1" }}
				/>
			</div>

			{/* Right Side */}
			<div
				className="flex flex-col bg-slate-50 overflow-hidden"
				style={{ width: `${100 - chatWidthPercent}%`, minWidth: "0" }}
			>
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center justify-between shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-4">
						{/* Editable Plan Name with Icon */}
						<div className="relative group">
							<input
	type="text"
	value={planName}
	onChange={(e) => setPlanName(e.target.value)}
	className="bg-transparent text-white font-semibold text-xl border-b-2 border-transparent hover:border-white focus:border-white focus:outline-none transition-all pr-8"
	style={{ minWidth: "150px" }}
	placeholder="Enter plan name"
/>
							<svg 
								className="w-4 h-4 text-white absolute right-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" 
								fill="none" 
								stroke="currentColor" 
								viewBox="0 0 24 24"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
							</svg>
						</div>
						<button
							type="button"
							onClick={handleSavePlan}
							className="px-3 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
							style={{ color: "#BE0000" }}
						>
							SAVE PLAN
						</button>
					</div>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => {
								onLogout();
								console.log("Logout clicked");
							}}
							className="px-2 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm"
							style={{ color: "#BE0000", fontSize: "10px" }}
						>
							Logout
						</button>
					</div>
				</header>
				<div className="flex-1 overflow-y-auto p-6 space-y-6 relative overflow-hidden">
					{/* Courses Panel */}
					<div
						className={`fixed top-16 right-0 h-[calc(100vh-4rem)] bg-white shadow-2xl transition-transform duration-300 ease-in-out z-20 ${
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
										type="button"
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
												onClick={() => handleCourseClick(course)}
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

					{/* Schedule Visualization */}
					{visualizationData && (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
							<h3 className="text-base font-semibold text-slate-800 mb-3">
								Weekly Class Schedule
							</h3>

							<div className="w-full">
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

								<div className="relative">
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
															const startMatch = classItem.startTime.match(/(\d+):(\d+)\s*(AM|PM)/);
															let startHour = parseInt(startMatch[1]);
															const startMin = parseInt(startMatch[2]);
															const startPeriod = startMatch[3];
															if (startPeriod === "PM" && startHour !== 12)
																startHour += 12;
															if (startPeriod === "AM" && startHour === 12)
																startHour = 0;

															const endMatch = classItem.endTime.match(/(\d+):(\d+)\s*(AM|PM)/);
															let endHour = parseInt(endMatch[1]);
															const endMin = parseInt(endMatch[2]);
															const endPeriod = endMatch[3];
															if (endPeriod === "PM" && endHour !== 12)
																endHour += 12;
															if (endPeriod === "AM" && endHour === 12)
																endHour = 0;

															const startOffset = (startHour - 8) * 42 + (startMin / 60) * 42;
															const duration = endHour - startHour + (endMin - startMin) / 60;
															const height = duration * 42 - 2;

															return (
																<div
																	key={idx}
																	onClick={() => handleScheduleItemClick(classItem)}
																	onMouseEnter={() => setHoveredScheduleItem(classItem.class_)}
																	onMouseLeave={() => setHoveredScheduleItem(null)}
																	className="absolute rounded px-1.5 py-1 text-white pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity"
																	style={{
																		backgroundColor: "#BE0000",
																		top: `${startOffset}px`,
																		height: `${height}px`,
																		left: 0,
																		right: 0,
																	}}
																>
																	<div className="font-semibold truncate" style={{ fontSize: "10px" }}>
																		{classItem.class_}
																	</div>
																	<div className="truncate" style={{ fontSize: "9px", opacity: 0.9 }}>
																		{classItem.room}
																	</div>
																	<div className="truncate" style={{ fontSize: "8px", opacity: 0.8 }}>
																		{classItem.startTime}-{classItem.endTime}
																	</div>
																	
																	{hoveredScheduleItem === classItem.class_ && (
																		<button
																			type="button"
																			onClick={(e) => handleDeleteCourse(e, classItem)}
																			className="absolute top-1 right-1 w-4 h-4 bg-white text-red-700 rounded-full flex items-center justify-center hover:bg-red-100 transition-all shadow-sm"
																			style={{ fontSize: "10px", fontWeight: "bold" }}
																		>
																			×
																		</button>
																	)}
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
						/>
						<button
							type="button"
							onClick={handleAddCourse}
							className="px-6 py-2 text-white font-semibold rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
							style={{ backgroundColor: '#BE0000' }}
						>
							<span>+</span>
							ADD COURSE
						</button>
						<button
							type="button"
							onClick={toggleCoursesPanel}
							className="px-6 py-2 text-white font-semibold rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
							style={{ backgroundColor: '#BE0000', color: "#FFFFFF" }}
						>
							{showCoursesPanel ? "Hide Courses" : "Browse Courses"}
						</button>
					</div>
				</div>
			</div>

			{/* Section Modal */}
			{showSectionModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
						<div className="flex justify-between items-center mb-4">
							<h3 className="text-xl font-semibold text-slate-800">
								Select a Section for Class {class_code}
							</h3>
							<button
								type="button"
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
												type="button"
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
					onClick={closeCourseDetails}
				>
					<div
						className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
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
								type="button"
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
								type="button"
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

		</div>
	);
}