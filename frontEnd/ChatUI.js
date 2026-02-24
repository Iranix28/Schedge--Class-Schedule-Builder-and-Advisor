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

function ChatUI({userData, onLogout, onBack, savedPlan, semester, onPlanSaved, onPlanCreated}) {
	const [messages, setMessages] = useState([
		{ role: "assistant", content: "I am your class advisor, please submit your degree audit by pressing the + button! (ONLY HTML)" },
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const [visualizationData, setVisualizationData] = useState(null);
	const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);
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
	const [autosaveStatus, setAutosaveStatus] = useState(null); // null | "saving" | "saved" | "error"

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

	// Track whether we've already initialized from this semester so that patching
	// plan_id / semester_db_id into the semester prop (after auto-creation) does NOT
	// re-run this effect and wipe the user's in-progress messages.
	const semesterInitializedRef = useRef(false);

	// Load saved messages + schedule when opening a semester (saved or fresh multi plan)
	useEffect(() => {
		if (!semester) return;
		// Only run once per ChatUI mount — skip subsequent updates that only patch in DB ids
		if (semesterInitializedRef.current) return;
		semesterInitializedRef.current = true;

		setPlanName(semester.name || semester._planTitle || "My Plan");
		if (semester.messages && semester.messages.length > 0) {
			setMessages(semester.messages);
		} else {
			setMessages([{ role: "assistant", content: "I am your class advisor, please submit your degree audit by pressing the + button! (ONLY HTML)" }]);
		}
		if (semester.schedule && semester.schedule.length > 0) {
			setVisualizationData({ type: "schedule", data: semester.schedule });
		} else {
			setVisualizationData(null);
		}
	}, [semester]);

	// Holds plan_id + semester_db_id after a manual save on a single plan.
	// Must be useState (not useRef) so isAutosaveMode re-evaluates after save.
	const [savedPlanIds, setSavedPlanIds] = useState(null);

	// isFreshMultiMode: semester has no DB ids yet but belongs to a multi plan context
	const isFreshMultiMode = !!(semester && !semester.plan_id && (semester._allSemesters || semester._existingPlanId));

	// isAutosaveMode: multi plans (saved or fresh) OR single plans after manual save
	const isAutosaveMode = !!(semester?.plan_id && semester?.semester_db_id)
		|| isFreshMultiMode
		|| !!(savedPlan?.id && savedPlan?.semester_db_id)
		|| !!(savedPlanIds);

	// When entering a brand-new semester on an already-created plan, eagerly register
	// it in the DB on mount so autosave has a real semester_db_id immediately —
	// without waiting for the user to send a message or add a course.
	useEffect(() => {
		if (!semester?._existingPlanId || !userData?.id) return;
		if (createdPlanRef.current) return; // already registered this session

		const registerSemester = async () => {
			if (isCreatingPlanRef.current) return;
			isCreatingPlanRef.current = true;
			try {
				const res = await fetch(`${BASE_URL}/plans/${semester._existingPlanId}/semesters`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						user_id: userData.id,
						term_season: semester.term,
						term_year: semester.year,
					}),
				});
				if (!res.ok) throw new Error(await res.text());
				const data = await res.json();
				const ids = { plan_id: semester._existingPlanId, semester_db_id: data.semester_db_id };
				createdPlanRef.current = ids;
				if (onPlanCreated) onPlanCreated(ids);
			} catch (e) {
				console.error("[ChatUI] failed to register semester on mount:", e);
			} finally {
				isCreatingPlanRef.current = false;
			}
		};

		registerSemester();
	}, []); // run once on mount only
	console.log("[ChatUI] semester:", semester, "isAutosaveMode:", isAutosaveMode, "isFreshMultiMode:", isFreshMultiMode);

	// Holds the live DB ids after a fresh plan is auto-created on first save
	const createdPlanRef = useRef(null); // { plan_id, semester_db_id }
	const isCreatingPlanRef = useRef(false); // prevent concurrent creation

	// Resolve the live plan_id / semester_db_id from any source
	const getActivePlanIds = () => {
		// Multi-plan: from semester prop
		if (semester?.plan_id && semester?.semester_db_id) {
			return { plan_id: semester.plan_id, semester_db_id: semester.semester_db_id };
		}
		// Multi-plan: from auto-creation ref
		if (createdPlanRef.current) {
			return createdPlanRef.current;
		}
		// Single-plan: from manual save ref
		// Single-plan: from manual save (state so it's always current)
		if (savedPlanIds) {
			return savedPlanIds;
		}
		// Single-plan: from savedPlan prop (opened from sidebar)
		if (savedPlan?.id && savedPlan?.semester_db_id) {
			return { plan_id: savedPlan.id, semester_db_id: savedPlan.semester_db_id };
		}
		return null;
	};

	// Creates the multi plan in the DB for the first time (or adds a new semester
	// to an already-created plan when _existingPlanId is set)
	const createFreshMultiPlan = async () => {
		const allSemesters = semester._allSemesters || [];
		const planTitle = semester._planTitle || "Multi-Semester Plan";
		const thisSemesterIndex = allSemesters.findIndex((s) => s.id === semester.id);

		let planId = semester._existingPlanId || null;
		let semesterDbId = null;

		if (!planId) {
			// Brand-new plan — POST to create it with all semesters
			const res = await fetch(`${BASE_URL}/plans/multi`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					user_id: userData.id,
					name: planTitle,
					semesters: allSemesters.map((s) => ({
						term_season: s.term,
						term_year: s.year,
						courses: s.courses || [],
					})),
				}),
			});
			if (!res.ok) throw new Error(await res.text());
			const created = await res.json();
			planId = created.id;

			// Resolve this semester's DB id from the full plan detail
			const detailRes = await fetch(`${BASE_URL}/plans/multi/${planId}?user_id=${userData.id}`);
			if (!detailRes.ok) throw new Error(await detailRes.text());
			const detail = await detailRes.json();
			semesterDbId = detail.semesters[thisSemesterIndex]?.id;

			if (onPlanSaved) onPlanSaved();
		} else {
			// Plan already exists — semester may already be registered from the mount effect
			if (createdPlanRef.current) {
				return createdPlanRef.current;
			}
			// Not registered yet — POST now
			const res = await fetch(`${BASE_URL}/plans/${planId}/semesters`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					user_id: userData.id,
					term_season: semester.term,
					term_year: semester.year,
				}),
			});
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			semesterDbId = data.semester_db_id;
		}

		if (!semesterDbId) throw new Error("Could not resolve semester DB id");

		const ids = { plan_id: planId, semester_db_id: semesterDbId };
		createdPlanRef.current = ids;

		if (onPlanCreated) onPlanCreated({ plan_id: planId, semester_db_id: semesterDbId });

		return ids;
	};

	// Called with fresh data explicitly to avoid stale closure issues
	const autosave = async (msgs, vizData) => {
		if (!isAutosaveMode) return;
		if (!userData?.id) return;

		setAutosaveStatus("saving");
		try {
			// Resolve or create plan ids
			let ids = getActivePlanIds();
			if (!ids) {
				if (isCreatingPlanRef.current) return; // already being created, skip
				isCreatingPlanRef.current = true;
				try {
					ids = await createFreshMultiPlan();
				} finally {
					isCreatingPlanRef.current = false;
				}
			}

			const courseSelections = [];
			const seen = new Set();
			(vizData?.data || []).forEach((item) => {
				if (!item.course_id) return;
				const key = `${item.course_id}-${item.class_section_id || "null"}`;
				if (!seen.has(key)) { seen.add(key); courseSelections.push({ course_id: item.course_id, class_section_id: item.class_section_id || null }); }
			});
			const payload = {
				user_id: userData.id,
				plan_name: (semester && (semester._planTitle || semester.name)) || planName || null,
				courseSelections,
				messages: msgs.map((m) => ({ role: m.role, content: m.content })),
				schedule: (vizData?.data || []).map((item) => ({ class_: item.class_ || "", day: item.day || "", startTime: item.startTime || "", endTime: item.endTime || "", room: item.room || "", course_id: item.course_id || null, class_section_id: item.class_section_id || null })),
			};
			const res = await fetch(`${BASE_URL}/plans/${ids.plan_id}/semesters/${ids.semester_db_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
			if (!res.ok) throw new Error(await res.text());
			setAutosaveStatus("saved");
			setTimeout(() => setAutosaveStatus(null), 2000);
			// Notify parent so sidebar re-fetches and moves this plan to the top
			if (onPlanSaved) onPlanSaved();
		} catch (err) {
			console.error("[autosave] error:", err);
			setAutosaveStatus("error");
		}
	};

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

		let finalMessages = [];
		try {
			await sendMessageLLM(userMessage, appendToken);
			await new Promise((resolve) => {
				setMessages((prev) => { finalMessages = prev; resolve(); return prev; });
			});
			if (isAutosaveMode) autosave(finalMessages, visualizationData);
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

	const toggleRightPanel = () => {
		setIsRightPanelExpanded(!isRightPanelExpanded);
	};

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

			if (!res.ok) {
				let detail = `HTTP ${res.status}`;
				try {
					const errBody = await res.json();
					detail = errBody.detail || JSON.stringify(errBody);
				} catch (_) {
					detail = await res.text() || detail;
				}
				throw new Error(detail);
			}

			const sections = await res.json();

			if (sections.length === 0) {
				alert(`No sections found for course code "${class_code}". Make sure you're entering just the number (e.g. 1410).`);
				return;
			}

			setAvailableSections(sections);
			setShowSectionModal(true);
			
		} catch (err) {
			console.error("handleAddCourse error:", err);
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

		let newVizData;
		if (visualizationData) {
			newVizData = { ...visualizationData, data: [...visualizationData.data, ...newEntries] };
		} else {
			newVizData = { type: "schedule", data: newEntries };
		}
		setVisualizationData(newVizData);
		if (isAutosaveMode) {
			let latestMsgs = [];
			setMessages((prev) => { latestMsgs = prev; return prev; });
			setTimeout(() => autosave(latestMsgs, newVizData), 0);
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

		const newVizData = updatedData.length === 0 ? null : { ...visualizationData, data: updatedData };
		setVisualizationData(newVizData);
		if (isAutosaveMode) {
			let latestMsgs = [];
			setMessages((prev) => { latestMsgs = prev; return prev; });
			setTimeout(() => autosave(latestMsgs, newVizData), 0);
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
				schedule: (visualizationData?.data || []).map((item) => ({
					class_: item.class_ || "",
					day: item.day || "",
					startTime: item.startTime || "",
					endTime: item.endTime || "",
					room: item.room || "",
					course_id: item.course_id || null,
					class_section_id: item.class_section_id || null,
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

			const data = await res.json();

			// Activate autosave for all future interactions on this plan
			if (data.id && data.semester_db_id) {
				setSavedPlanIds({ plan_id: data.id, semester_db_id: data.semester_db_id });
			}

			alert("Plan saved successfully");
			if (onPlanSaved) onPlanSaved();
		} catch (err) {
			console.error("Save error:", err);
			alert("Error saving plan");
		}
	};

	// --- Check if a section conflicts with current schedule ---
	const getSectionConflict = (section) => {
		const toMinutes = (timeStr) => {
			const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/);
			let h = parseInt(m[1]);
			if (m[3] === "PM" && h !== 12) h += 12;
			if (m[3] === "AM" && h === 12) h = 0;
			return h * 60 + parseInt(m[2]);
		};

		const reasons = [];

		// Check duplicate course
		const sectionMatch = section.class_?.match(/(\d+)/);
		if (sectionMatch) {
			const courseCode = sectionMatch[1];
			const duplicate = visualizationData?.data?.find(item => {
				const existingMatch = item.class_?.match(/(\d+)/);
				return existingMatch && existingMatch[1] === courseCode;
			});
			if (duplicate) reasons.push(`Already on schedule (${duplicate.class_})`);
		}

		// Check time overlaps across ALL days, grouped by class
		const days = parseDayAbbreviations(section.day);
		const conflictsByClass = {};
		for (const day of days) {
			const conflicting = (visualizationData?.data || []).filter(existing => {
				if (existing.day !== day) return false;
				const existStart = toMinutes(existing.startTime);
				const existEnd = toMinutes(existing.endTime);
				const newStart = toMinutes(section.startTime);
				const newEnd = toMinutes(section.endTime);
				return newStart < existEnd && newEnd > existStart;
			});
			for (const c of conflicting) {
				if (!conflictsByClass[c.class_]) {
					conflictsByClass[c.class_] = [];
				}
				conflictsByClass[c.class_].push(day);
			}
		}
		for (const [className, classDays] of Object.entries(conflictsByClass)) {
			reasons.push(`Conflicts with ${className} on ${classDays.join(", ")}`);
		}

		return reasons.length > 0 ? reasons : null;
	};


	return (
		<div className="flex h-screen bg-slate-100 relative">
			{/* Left Side - Chat Interface */}
			<div
				className={`flex flex-col border-r border-slate-300 bg-white transition-all duration-500 ease-in-out overflow-hidden ${
					isRightPanelExpanded ? "w-0" : "w-1/3"
				}`}
			>
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-3">
						{(isAutosaveMode || isFreshMultiMode) && (
							<button
								type="button"
								onClick={() => onBack({ messages, schedule: visualizationData?.data || [], planName: semester?._planTitle || planName })}
								className="flex items-center gap-1 text-white opacity-80 hover:opacity-100 transition-opacity"
								title="Back to semester overview"
							>
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
								</svg>
								<span className="text-sm font-medium">Back</span>
							</button>
						)}
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

			{/* Right Side */}
			<div
				className={`flex flex-col bg-slate-50 transition-all duration-500 ease-in-out ${
					isRightPanelExpanded ? "w-full" : "w-2/3"
				}`}
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
						{isAutosaveMode ? (
							<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white bg-opacity-20">
								{autosaveStatus === "saving" && (<><svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span className="text-white text-xs">Saving...</span></>)}
								{autosaveStatus === "saved" && (<><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg><span className="text-white text-xs">Saved</span></>)}
								{autosaveStatus === "error" && (<><svg className="w-3.5 h-3.5 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><span className="text-yellow-200 text-xs">Save failed</span></>)}
								{autosaveStatus === null && (<span className="text-white text-xs opacity-60">Autosave on</span>)}
							</div>
						) : (
							<button
								type="button"
								onClick={handleSavePlan}
								className="px-3 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
								style={{ color: "#BE0000" }}
							>
								SAVE PLAN
							</button>
						)}
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
				<div className="flex-1 overflow-y-auto pl-4 pr-6 py-6 space-y-6 relative overflow-hidden">
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
								<div className="flex gap-1 mb-1">
									<div style={{ width: "45px", flexShrink: 0 }}></div>
									{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
										<div
											key={day}
											className="flex-1 text-sm font-semibold text-slate-600 text-center py-1"
										>
											{day}
										</div>
									))}
								</div>

								<div className="relative">
									<div className="space-y-0.5">
										{[
											"8 AM",
											"9 AM",
											"10 AM",
											"11 AM",
											"12 PM",
											"1 PM",
											"2 PM",
											"3 PM",
											"4 PM",
											"5 PM",
										].map((time) => (
											<div key={time} className="flex gap-1">
												<div className="text-slate-400 text-right pr-3 h-12 leading-none whitespace-nowrap" style={{ fontSize: "10px", marginTop: "-5px", width: "45px", flexShrink: 0 }}>
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
														className="flex-1 h-12 border-t border-slate-200 bg-slate-50"
													></div>
												))}
											</div>
										))}
									</div>

									<div className="absolute inset-0 pointer-events-none">
										<div className="flex gap-1 h-full">
											<div style={{ width: "45px", flexShrink: 0 }}></div>
											{[
												"Monday",
												"Tuesday",
												"Wednesday",
												"Thursday",
												"Friday",
											].map((day) => (
												<div key={day} className="flex-1 relative">
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

															const startOffset = (startHour - 8) * 50 + (startMin / 60) * 50;
															const duration = endHour - startHour + (endMin - startMin) / 60;
															const height = duration * 50 - 2;

															return (
																<div
																	key={idx}
																	onClick={() => handleScheduleItemClick(classItem)}
																	onMouseEnter={() => setHoveredScheduleItem(classItem.class_)}
																	onMouseLeave={() => setHoveredScheduleItem(null)}
																	className="absolute px-1.5 py-1 text-white pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity"
																	style={{
																		backgroundColor: "#BE0000",
																		top: `${startOffset}px`,
																		height: `${height}px`,
																		left: 0,
																		right: 0,
																	}}
																>
																	<div className="font-semibold truncate" style={{ fontSize: "12px" }}>
																		{classItem.class_}
																	</div>
																	<div className="truncate" style={{ fontSize: "11px", opacity: 0.9 }}>
																		{classItem.room}
																	</div>
																	<div className="truncate" style={{ fontSize: "10px", opacity: 0.8 }}>
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
								availableSections.map((section, index) => {
									const conflictReasons = getSectionConflict(section);
									const isDisabled = !!conflictReasons;
									return (
										<div
											key={index}
											onClick={() => !isDisabled && handleSelectSection(section)}
											className={`border rounded-lg p-4 transition-all ${
												isDisabled
													? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
													: "border-slate-200 hover:border-red-700 hover:bg-slate-50 cursor-pointer"
											}`}
										>
											<div className="flex justify-between items-start">
												<div>
													<h4 className={`font-semibold mb-1 ${isDisabled ? "text-slate-400" : "text-slate-800"}`}>
														{section.class_}
													</h4>
													<p className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}>
														<span className="font-medium">Day:</span> {section.day}
													</p>
													<p className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}>
														<span className="font-medium">Time:</span> {section.startTime} - {section.endTime}
													</p>
													<p className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}>
														<span className="font-medium">Room:</span> {section.room}
													</p>
													{isDisabled && (
														<div className="mt-2 space-y-0.5">
															{conflictReasons.map((reason, i) => (
																<p key={i} className="text-xs text-red-400 font-medium">
																	⚠ {reason}
																</p>
															))}
														</div>
													)}
												</div>
												{!isDisabled && (
													<button
														type="button"
														className="px-3 py-1 text-white text-sm font-semibold rounded hover:opacity-90"
														style={{ backgroundColor: '#BE0000' }}
													>
														Select
													</button>
												)}
											</div>
										</div>
									);
								})
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

			{/* Expand/Collapse Button */}
			<button
				type="button"
				onClick={toggleRightPanel}
				className="absolute top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md border flex items-center justify-center hover:bg-slate-50 z-10"
				style={{
					left: isRightPanelExpanded ? "10px" : "calc(33.33% - 12px)",
					borderColor: "#BE0000",
					transition: "left 0.5s ease-in-out",
				}}
				title={isRightPanelExpanded ? "Show chat" : "Expand panel"}
			>
				{isRightPanelExpanded ? (
					<span className="text-lg font-bold" style={{ color: "#BE0000" }}>
						×
					</span>
				) : (
					<span className="text-lg font-bold" style={{ color: "#BE0000" }}>
						←
					</span>
				)}
			</button>
		</div>
	);
}